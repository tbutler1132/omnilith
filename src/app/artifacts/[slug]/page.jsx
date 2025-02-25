import { client } from "../../../sanity/lib/client";
import { PortableText } from "@portabletext/react";
import styles from "./artifact.module.css";

const query = `*[_type == "post" && slug.current == $slug][0] {
    title,
    body,
    mainImage { asset->{url} },
    publishedAt,
    "author": author->name,
    "categories": categories[]->title
  }`;

const Artifact = async ({ params }) => {
  const slug = (await params).slug;
  const post = await client.fetch(query, { slug });
  console.log("Post", post);
  return (
    <div className={styles.blogContainer}>
      <h1 className={styles.blogTitle}>{post.title}</h1>
      <p className={styles.blogMeta}>
        By {post.author} • {new Date(post.publishedAt).toLocaleDateString()}
      </p>
      {post.mainImage?.asset.url && (
        <img
          className={styles.blogImage}
          src={post.mainImage.asset.url}
          alt={post.title}
        />
      )}
      <p className={styles.blogCategories}>
        Categories: {post.categories.join(", ")}
      </p>
      <div className={styles.blogContent}>
        <PortableText value={post.body} />
      </div>
    </div>
  );
};

export default Artifact;
