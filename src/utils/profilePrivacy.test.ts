function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function canViewProfilePosts(
  viewerId: string | null,
  ownerId: string,
  isPrivate: boolean,
  isFollowing: boolean
): boolean {
  if (viewerId && viewerId === ownerId) {
    return true;
  }
  if (!isPrivate) {
    return true;
  }
  if (!viewerId) {
    return false;
  }
  return isFollowing;
}

export function runProfilePrivacyTests(): void {
  assert(
    canViewProfilePosts("a", "a", true, false),
    "owner always sees own content"
  );
  assert(
    canViewProfilePosts("b", "a", false, false),
    "public profile visible to non-follower"
  );
  assert(
    !canViewProfilePosts("b", "a", true, false),
    "private profile hidden from non-follower"
  );
  assert(
    canViewProfilePosts("b", "a", true, true),
    "private profile visible to follower"
  );
  assert(
    !canViewProfilePosts(null, "a", true, false),
    "guest cannot see private profile posts"
  );
  assert(
    canViewProfilePosts(null, "a", false, false),
    "guest can see public profile posts"
  );

  console.log("profilePrivacy tests passed");
}

if (require.main === module) {
  runProfilePrivacyTests();
}
