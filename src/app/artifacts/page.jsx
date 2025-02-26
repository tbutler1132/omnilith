import { client } from "../../sanity/lib/client";
import Link from "next/link";
import styles from "./artifacts.module.css";
import { GET_POSTS } from "../queries/postsQueries";

const Artifacts = async ({ searchParams }) => {
  // const paramValue = await searchParams.category;
  const posts = await client.fetch(GET_POSTS);
  return (
    <div className={styles.container}>
      <ul className={styles.blogList}>
        {posts.map((post) => (
          <li key={post._id} className={styles.blogItem}>
            <Link
              href={`/artifacts/${post.slug.current}`}
              className={styles.cardLink}
            >
              <div className={styles.content}>
                <h2>{post.title}</h2>
                <p>
                  {new Date(post.publishedAt).toLocaleDateString()} • By{" "}
                  {post.author}
                </p>
                <p className={styles.category}>
                  Categories: {post.categories?.join(", ")}
                </p>
              </div>
              {post.mainImage?.asset.url && (
                <img src={post.mainImage.asset.url} alt={post.title} />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Artifacts;
