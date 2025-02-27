import { client } from "../../sanity/lib/client";
import { Suspense } from "react";
import { getPosts } from "../../queries/postsQueries";
import ArtifactsFilter from "./artifacts-filter";

function SearchBarFallback() {
  return <>placeholder</>;
}

const Artifacts = async () => {
  // const paramValue = await searchParams;
  const posts = await client.fetch(getPosts());

  return (
    <>
      <Suspense fallback={<SearchBarFallback />}>
        <ArtifactsFilter posts={posts} />
      </Suspense>
    </>
  );
};

export default Artifacts;
