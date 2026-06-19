import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Herbruikbare double-tap "like" hart-animatie (TikTok/Instagram-stijl).
 *
 * Render dit als overlay binnen de media-container (absoluut, vult de ouder).
 * Roep `ref.trigger(x, y)` aan met de tap-positie (relatief aan deze overlay).
 * Zonder coördinaten verschijnt het hart in het midden.
 *
 * Meerdere snelle dubbeltikken tonen meerdere onafhankelijke harten; elk hart
 * ruimt zichzelf op na de animatie, dus er blijft niets achter in de tree.
 */

export type DoubleTapHeartHandle = {
  trigger: (x?: number, y?: number) => void;
};

const HEART_SIZE = 110;
const DRIFT_UP = 84; // translateY omhoog tijdens fade-out
const POP_IN_MS = 140;
const HOLD_MS = 220;
const FADE_OUT_MS = 460;

type HeartInstance = {
  key: number;
  /** Middelpunt van het hart binnen de overlay; null = centreren. */
  x: number | null;
  y: number | null;
  rotate: string;
  driftX: number;
  opacity: Animated.Value;
  scale: Animated.Value;
  translateY: Animated.Value;
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export const DoubleTapHeartAnimation = forwardRef<DoubleTapHeartHandle>(
  function DoubleTapHeartAnimation(_props, ref) {
    const [hearts, setHearts] = useState<HeartInstance[]>([]);
    const keyRef = useRef(0);

    const removeHeart = useCallback((key: number) => {
      setHearts((prev) => prev.filter((h) => h.key !== key));
    }, []);

    const trigger = useCallback(
      (x?: number, y?: number) => {
        const key = keyRef.current++;
        const heart: HeartInstance = {
          key,
          x: typeof x === "number" ? x : null,
          y: typeof y === "number" ? y : null,
          rotate: `${randomBetween(-15, 15).toFixed(1)}deg`,
          driftX: randomBetween(-20, 20),
          opacity: new Animated.Value(0),
          scale: new Animated.Value(0.3),
          translateY: new Animated.Value(0),
        };

        setHearts((prev) => [...prev, heart]);

        Animated.parallel([
          // Pop in: 0.3 -> 1.25 -> 1.0 met bounce.
          Animated.sequence([
            Animated.timing(heart.scale, {
              toValue: 1.25,
              duration: POP_IN_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(heart.scale, {
              toValue: 1,
              friction: 4,
              tension: 160,
              useNativeDriver: true,
            }),
          ]),
          // Snel infaden.
          Animated.timing(heart.opacity, {
            toValue: 1,
            duration: 100,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          // Schuin omhoog drijven + uitfaden na een korte hold.
          Animated.sequence([
            Animated.delay(POP_IN_MS + HOLD_MS),
            Animated.parallel([
              Animated.timing(heart.translateY, {
                toValue: -DRIFT_UP,
                duration: FADE_OUT_MS,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(heart.opacity, {
                toValue: 0,
                duration: FADE_OUT_MS,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]).start(({ finished }) => {
          if (finished) {
            removeHeart(key);
          }
        });
      },
      [removeHeart]
    );

    useImperativeHandle(ref, () => ({ trigger }), [trigger]);

    return (
      <View style={styles.overlay} pointerEvents="none">
        {hearts.map((heart) => {
          const positioned = heart.x != null && heart.y != null;
          return (
            <Animated.View
              key={heart.key}
              style={[
                styles.heartWrap,
                positioned
                  ? {
                      position: "absolute",
                      left: (heart.x ?? 0) - HEART_SIZE / 2,
                      top: (heart.y ?? 0) - HEART_SIZE / 2,
                    }
                  : styles.heartCentered,
                {
                  opacity: heart.opacity,
                  transform: [
                    { translateX: heart.driftX },
                    { translateY: heart.translateY },
                    { scale: heart.scale },
                    { rotate: heart.rotate },
                  ],
                },
              ]}
            >
              <Ionicons
                name="heart"
                size={HEART_SIZE}
                color="rgba(255,255,255,0.96)"
                style={styles.heartIcon}
              />
            </Animated.View>
          );
        })}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  heartWrap: {
    width: HEART_SIZE,
    height: HEART_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  heartCentered: {
    position: "absolute",
  },
  heartIcon: {
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
