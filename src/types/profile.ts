export type AccountType = "consumer" | "creator" | "business";

export type Profile = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  accountType: AccountType;
  isPrivate: boolean;
};

export type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  account_type: string | null;
  is_private?: boolean | null;
};

export function normalizeAccountType(
  value: string | null | undefined
): AccountType {
  if (value === "creator" || value === "business") {
    return value;
  }
  return "consumer";
}

export function mapProfileRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    accountType: normalizeAccountType(row.account_type),
    isPrivate: row.is_private === true,
  };
}
