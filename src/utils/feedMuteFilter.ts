export type FeedMuteSets = {
  blockedProfileIds: Set<string>;
  hiddenPostIds: Set<string>;
};

export function shouldMuteFeedPost(
  post: { id: string; ownerProfileId?: string | null },
  muteSets: FeedMuteSets
): boolean {
  if (muteSets.hiddenPostIds.has(post.id)) {
    return true;
  }
  const ownerId = post.ownerProfileId;
  if (ownerId && muteSets.blockedProfileIds.has(ownerId)) {
    return true;
  }
  return false;
}

export function filterFeedPostsByMuteSets<
  T extends { id: string; ownerProfileId?: string | null },
>(posts: T[], muteSets: FeedMuteSets): T[] {
  if (
    muteSets.blockedProfileIds.size === 0 &&
    muteSets.hiddenPostIds.size === 0
  ) {
    return posts;
  }
  return posts.filter((post) => !shouldMuteFeedPost(post, muteSets));
}
