import { supabase } from "../lib/supabase";
import type {
  FollowRequestStatus,
  IncomingFollowRequest,
  OutgoingAcceptedFollowRequest,
} from "../types/followRequest";

export async function getOutgoingFollowRequestStatus(
  recipientId: string
): Promise<FollowRequestStatus | null> {
  const { data, error } = await supabase.rpc("get_outgoing_follow_request_status", {
    p_recipient_id: recipientId,
  });

  if (error) {
    throw error;
  }

  if (data === "pending") {
    return "pending";
  }
  return null;
}

export async function sendFollowRequest(recipientId: string): Promise<string> {
  const { data, error } = await supabase.rpc("send_follow_request", {
    p_recipient_id: recipientId,
  });

  if (error) {
    throw error;
  }

  if (typeof data !== "string" || data.length === 0) {
    throw new Error("Volgverzoek kon niet worden verstuurd.");
  }

  return data;
}

export async function cancelFollowRequest(recipientId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("cancel_follow_request", {
    p_recipient_id: recipientId,
  });

  if (error) {
    throw error;
  }

  return data === true;
}

export async function acceptFollowRequest(requestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("accept_follow_request", {
    p_request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data === true;
}

export async function declineFollowRequest(requestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("decline_follow_request", {
    p_request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data === true;
}

export async function fetchIncomingPendingFollowRequests(): Promise<
  IncomingFollowRequest[]
> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from("follow_requests")
    .select("id, requester_id, recipient_id, status, created_at, updated_at")
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  if (!rows?.length) {
    return [];
  }

  const requesterIds = [...new Set(rows.map((r) => r.requester_id))];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", requesterIds);

  if (profileError) {
    throw profileError;
  }

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  );

  return rows.map((row) => {
    const requester = profileMap.get(row.requester_id);
    return {
      id: row.id,
      requester_id: row.requester_id,
      recipient_id: row.recipient_id,
      status: row.status as FollowRequestStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
      requester: {
        id: row.requester_id,
        username: requester?.username ?? null,
        display_name: requester?.display_name ?? null,
        avatar_url: requester?.avatar_url ?? null,
      },
    };
  });
}

export async function fetchOutgoingAcceptedFollowRequests(): Promise<
  OutgoingAcceptedFollowRequest[]
> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from("follow_requests")
    .select(
      "id, requester_id, recipient_id, status, created_at, updated_at, accepted_at"
    )
    .eq("requester_id", user.id)
    .eq("status", "accepted")
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  if (!rows?.length) {
    return [];
  }

  const recipientIds = [...new Set(rows.map((r) => r.recipient_id))];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", recipientIds);

  if (profileError) {
    throw profileError;
  }

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  );

  return rows
    .filter((row) => typeof row.accepted_at === "string" && row.accepted_at.length > 0)
    .map((row) => {
      const recipient = profileMap.get(row.recipient_id);
      return {
        id: row.id,
        requester_id: row.requester_id,
        recipient_id: row.recipient_id,
        status: row.status as FollowRequestStatus,
        created_at: row.created_at,
        updated_at: row.updated_at,
        accepted_at: row.accepted_at as string,
        recipient: {
          id: row.recipient_id,
          username: recipient?.username ?? null,
          display_name: recipient?.display_name ?? null,
          avatar_url: recipient?.avatar_url ?? null,
        },
      };
    });
}

export function subscribeFollowRequestInserts(
  recipientId: string,
  onInsert: () => void
): () => void {
  const channel = supabase
    .channel(`follow_requests:${recipientId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "follow_requests",
        filter: `recipient_id=eq.${recipientId}`,
      },
      () => {
        onInsert();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeOutgoingFollowRequestChanges(
  requesterId: string,
  recipientId: string,
  onChange: () => void
): () => void {
  const channel = supabase
    .channel(`follow_requests_out:${requesterId}:${recipientId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "follow_requests",
        filter: `requester_id=eq.${requesterId}`,
      },
      () => {
        onChange();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "follows",
        filter: `follower_id=eq.${requesterId}`,
      },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeOutgoingFollowRequestAccepted(
  requesterId: string,
  onAccepted: () => void
): () => void {
  const channel = supabase
    .channel(`follow_requests_accepted:${requesterId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "follow_requests",
        filter: `requester_id=eq.${requesterId}`,
      },
      () => {
        onAccepted();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
