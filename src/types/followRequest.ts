export type FollowRequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled";

export type FollowRequestRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: FollowRequestStatus;
  created_at: string;
  updated_at: string;
  accepted_at?: string | null;
};

export type IncomingFollowRequest = FollowRequestRow & {
  requester: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};

export type OutgoingAcceptedFollowRequest = FollowRequestRow & {
  accepted_at: string;
  recipient: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};
