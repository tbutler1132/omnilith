import { client } from "../../sanity/lib/client";
import { Suspense } from "react";
import { getPosts } from "../../queries/postsQueries";
import ArtifactsFilter from "./artifacts-filter";
import LinearProgress from "@mui/material/LinearProgress";

function SearchBarFallback() {
  return <LinearProgress color="secondary" />;
}

const Artifacts = async () => {
  // const paramValue = await searchParams;
  const posts = await client.fetch(getPosts());

  if (!posts) {
    return "There was an error.";
  }

  return (
    <>
      <Suspense fallback={<SearchBarFallback />}>
        <ArtifactsFilter posts={posts} />
      </Suspense>
    </>
  );
};

export default Artifacts;
