import { Buffer } from "buffer";
import { Image, Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import jpeg from "jpeg-js";
import type { RefObject } from "react";
import type { View } from "react-native";

const globalScope = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

if (!globalScope.Buffer) {
  globalScope.Buffer = Buffer;
}

export type AvatarCropTransform = {
  offsetX: number;
  offsetY: number;
  /** Zoom bovenop de fit-schaal. 1 = volledige foto zichtbaar in beeld. */
  scaleFactor: number;
  fitScale: number;
};

/** Hoe ver je kunt uitzoomen (zwarte rand in de cirkel). */
export const MIN_AVATAR_SCALE_FACTOR = 0.35;
export const MAX_AVATAR_SCALE_FACTOR = 4;

export function getBaseCoverScale(
  imageWidth: number,
  imageHeight: number,
  cropSize: number
): number {
  return Math.max(cropSize / imageWidth, cropSize / imageHeight);
}

export function getFitScale(
  imageWidth: number,
  imageHeight: number,
  stageWidth: number,
  stageHeight: number
): number {
  if (stageWidth <= 0 || stageHeight <= 0) {
    return 1;
  }
  return Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
}

export function getDisplayScale(fitScale: number, scaleFactor: number): number {
  return fitScale * scaleFactor;
}

/**
 * Ruime pan-limiet: foto mag ver genoeg schuiven zodat zwarte
 * letterbox-randen binnen de cirkel vallen (WhatsApp-gedrag).
 */
export function clampAvatarCropOffset(
  offsetX: number,
  offsetY: number,
  imageWidth: number,
  imageHeight: number,
  cropSize: number,
  fitScale: number,
  scaleFactor: number
): { offsetX: number; offsetY: number } {
  const displayScale = getDisplayScale(fitScale, scaleFactor);
  const imgW = imageWidth * displayScale;
  const imgH = imageHeight * displayScale;
  const maxX = cropSize / 2 + imgW / 2;
  const maxY = cropSize / 2 + imgH / 2;
  return {
    offsetX: Math.min(maxX, Math.max(-maxX, offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
}

function getImageDrawRect(
  imageWidth: number,
  imageHeight: number,
  cropSize: number,
  transform: AvatarCropTransform
) {
  const displayScale = getDisplayScale(transform.fitScale, transform.scaleFactor);
  const imgW = imageWidth * displayScale;
  const imgH = imageHeight * displayScale;
  const left = cropSize / 2 + transform.offsetX - imgW / 2;
  const top = cropSize / 2 + transform.offsetY - imgH / 2;
  return { left, top, width: imgW, height: imgH, displayScale };
}

function toUint8Array(data: Uint8Array | Buffer | number[]): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  return Uint8Array.from(data);
}

function needsLetterboxExport(
  left: number,
  top: number,
  width: number,
  height: number,
  cropSize: number,
  outputSize: number
): boolean {
  const outScale = outputSize / cropSize;
  const destLeft = left * outScale;
  const destTop = top * outScale;
  const destRight = destLeft + width * outScale;
  const destBottom = destTop + height * outScale;
  return (
    destLeft > 0.5 ||
    destTop > 0.5 ||
    destRight < outputSize - 0.5 ||
    destBottom < outputSize - 0.5
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  const table =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += table[a >> 2];
    result += table[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < bytes.length ? table[((b & 15) << 2) | (c >> 6)] : "=";
    result += i + 2 < bytes.length ? table[c & 63] : "=";
  }
  return result;
}

function fillBlackFrame(size: number): Uint8Array {
  const frame = new Uint8Array(size * size * 4);
  for (let i = 0; i < frame.length; i += 4) {
    frame[i] = 0;
    frame[i + 1] = 0;
    frame[i + 2] = 0;
    frame[i + 3] = 255;
  }
  return frame;
}

function blitRgba(
  target: Uint8Array,
  targetWidth: number,
  targetHeight: number,
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  destLeft: number,
  destTop: number
) {
  for (let sy = 0; sy < sourceHeight; sy += 1) {
    const dy = destTop + sy;
    if (dy < 0 || dy >= targetHeight) {
      continue;
    }
    for (let sx = 0; sx < sourceWidth; sx += 1) {
      const dx = destLeft + sx;
      if (dx < 0 || dx >= targetWidth) {
        continue;
      }
      const srcIdx = (sy * sourceWidth + sx) * 4;
      const dstIdx = (dy * targetWidth + dx) * 4;
      target[dstIdx] = source[srcIdx];
      target[dstIdx + 1] = source[srcIdx + 1];
      target[dstIdx + 2] = source[srcIdx + 2];
      target[dstIdx + 3] = 255;
    }
  }
}

async function exportAvatarCropWeb(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  cropSize: number,
  transform: AvatarCropTransform,
  outputSize = 512
): Promise<string> {
  const { left, top, width, height } = getImageDrawRect(
    imageWidth,
    imageHeight,
    cropSize,
    transform
  );
  const outScale = outputSize / cropSize;

  const browser = globalThis as typeof globalThis & {
    document?: {
      createElement: (tag: string) => {
        width: number;
        height: number;
        getContext: (type: string) => {
          fillStyle: string;
          fillRect: (x: number, y: number, w: number, h: number) => void;
          drawImage: (
            image: { width: number; height: number },
            x: number,
            y: number,
            w: number,
            h: number
          ) => void;
        } | null;
        toDataURL: (type: string, quality: number) => string;
      };
    };
    Image?: new () => {
      crossOrigin: string;
      onload: (() => void) | null;
      onerror: (() => void) | null;
      src: string;
      width: number;
      height: number;
    };
  };

  if (!browser.document || !browser.Image) {
    throw new Error("Web-export is niet beschikbaar.");
  }

  const canvas = browser.document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Kon export-canvas niet maken.");
  }

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, outputSize, outputSize);

  const img = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const el = new browser.Image!();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error("Kon de foto niet laden voor export."));
      el.src = imageUri;
    }
  );

  ctx.drawImage(
    img,
    left * outScale,
    top * outScale,
    width * outScale,
    height * outScale
  );

  return canvas.toDataURL("image/jpeg", 0.9);
}

async function exportAvatarCropNativeSimple(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  cropSize: number,
  transform: AvatarCropTransform,
  outputSize: number
): Promise<string> {
  const crop = computeAvatarCropRect(imageWidth, imageHeight, cropSize, transform);
  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ crop }, { resize: { width: outputSize, height: outputSize } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

async function exportAvatarCropNativeWithLetterbox(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  cropSize: number,
  transform: AvatarCropTransform,
  outputSize = 512
): Promise<string> {
  const { left, top, width, height } = getImageDrawRect(
    imageWidth,
    imageHeight,
    cropSize,
    transform
  );
  const outScale = outputSize / cropSize;
  const destLeft = Math.round(left * outScale);
  const destTop = Math.round(top * outScale);
  const destW = Math.max(1, Math.round(width * outScale));
  const destH = Math.max(1, Math.round(height * outScale));

  const resized = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: destW, height: destH } }],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
  );

  const response = await fetch(resized.uri);
  if (!response.ok) {
    throw new Error("Kon de foto niet voorbereiden voor export.");
  }

  const resizedBytes = new Uint8Array(await response.arrayBuffer());
  const decoded = jpeg.decode(resizedBytes, { useTArray: true });
  const frame = fillBlackFrame(outputSize);
  blitRgba(
    frame,
    outputSize,
    outputSize,
    toUint8Array(decoded.data),
    decoded.width,
    decoded.height,
    destLeft,
    destTop
  );

  const encoded = jpeg.encode(
    { data: frame, width: outputSize, height: outputSize },
    90
  );
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error("Cache-map niet beschikbaar.");
  }

  const outPath = `${cacheDir}avatar-crop-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(
    outPath,
    bytesToBase64(toUint8Array(encoded.data)),
    {
      encoding: FileSystem.EncodingType.Base64,
    }
  );
  return outPath;
}

async function exportAvatarCropNative(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  cropSize: number,
  transform: AvatarCropTransform,
  outputSize = 512
): Promise<string> {
  const { left, top, width, height } = getImageDrawRect(
    imageWidth,
    imageHeight,
    cropSize,
    transform
  );

  if (
    !needsLetterboxExport(left, top, width, height, cropSize, outputSize)
  ) {
    return exportAvatarCropNativeSimple(
      imageUri,
      imageWidth,
      imageHeight,
      cropSize,
      transform,
      outputSize
    );
  }

  return exportAvatarCropNativeWithLetterbox(
    imageUri,
    imageWidth,
    imageHeight,
    cropSize,
    transform,
    outputSize
  );
}

type ExportOptions = {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  cropSize: number;
  transform: AvatarCropTransform;
  outputSize?: number;
};

export async function exportAvatarCrop({
  imageUri,
  imageWidth,
  imageHeight,
  cropSize,
  transform,
  outputSize = 512,
}: ExportOptions): Promise<string> {
  if (Platform.OS === "web") {
    return exportAvatarCropWeb(
      imageUri,
      imageWidth,
      imageHeight,
      cropSize,
      transform,
      outputSize
    );
  }

  return exportAvatarCropNative(
    imageUri,
    imageWidth,
    imageHeight,
    cropSize,
    transform,
    outputSize
  );
}

export function computeAvatarCropRect(
  imageWidth: number,
  imageHeight: number,
  cropSize: number,
  transform: AvatarCropTransform
) {
  const { left: imageLeft, top: imageTop, displayScale } = getImageDrawRect(
    imageWidth,
    imageHeight,
    cropSize,
    transform
  );

  let originX = (0 - imageLeft) / displayScale;
  let originY = (0 - imageTop) / displayScale;
  let width = cropSize / displayScale;
  let height = cropSize / displayScale;

  originX = Math.max(0, Math.round(originX));
  originY = Math.max(0, Math.round(originY));
  width = Math.min(Math.round(width), imageWidth - originX);
  height = Math.min(Math.round(height), imageHeight - originY);
  const size = Math.min(width, height);

  return { originX, originY, width: size, height: size };
}

export async function cropAvatarImage(
  uri: string,
  imageWidth: number,
  imageHeight: number,
  cropSize: number,
  transform: AvatarCropTransform,
  _captureTarget?: RefObject<View | null>
): Promise<string> {
  return exportAvatarCrop({
    imageUri: uri,
    imageWidth,
    imageHeight,
    cropSize,
    transform,
  });
}

export async function resolveImageDimensions(
  uri: string,
  width?: number | null,
  height?: number | null
): Promise<{ width: number; height: number }> {
  if (width && height && width > 0 && height > 0) {
    return { width, height };
  }
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ width: w, height: h }),
      (error) => reject(error)
    );
  });
}
