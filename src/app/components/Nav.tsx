import Link from "next/link";
import styles from "../page.module.css";

const Nav = () => {
  return (
    <nav className={styles.mainNav}>
      <div>
        <span>OMNILITH</span>
      </div>
      <div>
        <Link href="/beats">Beats</Link>
        <Link href="/artifacts">Blog</Link>
      </div>
    </nav>
  );
};

export default Nav;
