import { client } from "../../sanity/lib/client";
import Link from "next/link";
import styles from "./artifacts.module.css";

const query = `*[_type == "post"] | order(publishedAt desc) {
    _id,
    title,
    slug,
    mainImage { asset->{url} },
    publishedAt,
    "author": author->name,
    "categories": categories[]->title
  }`;

const Artifacts = async () => {
  const posts = await client.fetch(query);
  console.log("Posts", posts);
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Artifacts</h1>
      <ul className={styles.blogList}>
        {posts.map((post) => (
          <li key={post._id} className={styles.blogItem}>
            <Link href={`/artifacts/${post.slug.current}`}>{post.title}</Link>
            <img src={post.mainImage?.asset.url} alt={"No image"} />
            <p>{new Date(post.publishedAt).toLocaleDateString()}</p>
            <p>By: {post.author}</p>
            <p>Categories: {post.categories.join(", ")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Artifacts;
