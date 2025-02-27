"use client";
import { useSearchParams } from "next/navigation";

import Link from "next/link";
import styles from "./artifacts.module.css";

const ArtifactsFilter = ({ posts }) => {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get("category");

  const filteredPosts = categoryFilter
    ? posts.filter((post) => post.categories?.includes(categoryFilter))
    : posts;

  return (
    <div className={styles.container}>
      <ul className={styles.blogList}>
        {filteredPosts.map((post) => (
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

export default ArtifactsFilter;
