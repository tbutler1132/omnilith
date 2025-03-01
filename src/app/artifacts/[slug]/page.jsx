import { client } from "../../../sanity/lib/client";
import { PortableText } from "@portabletext/react";
import styles from "./artifact.module.css";
import { GET_POST } from "../../../queries/postsQueries";
import { convertToEmbedYoutubeUrl } from "../../utils/urlUtils";

const Artifact = async ({ params }) => {
  const slug = (await params).slug;
  const post = await client.fetch(GET_POST, { slug });

  if (!post) {
    return "There was an error.";
  }

  return (
    <div className={styles.blogContainer}>
      <h1 className={styles.blogTitle}>{post.title}</h1>
      <p className={styles.blogMeta}>
        By {post.author} • {new Date(post.publishedAt).toLocaleDateString()}
      </p>
      {post.youtubeVideo && (
        <div className={styles.youtubeEmbed}>
          <iframe
            width="100%"
            height="600"
            src={convertToEmbedYoutubeUrl(post.youtubeVideo)}
            frameBorder="0"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube video"
          />
        </div>
      )}
      {post.mainImage?.asset.url && !post.youtubeVideo && (
        <img
          className={styles.blogImage}
          src={post.mainImage.asset.url}
          alt={post.title}
        />
      )}
      <div className={styles.blogContent}>
        <PortableText value={post.body} />
      </div>
      <p className={styles.blogCategories}>
        Categories: {post.categories.join(", ")}
      </p>
    </div>
  );
};

export default Artifact;
