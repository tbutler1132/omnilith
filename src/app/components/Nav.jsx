import Link from "next/link";
import styles from "../page.module.css";

const Nav = () => {
  return (
    <nav className={styles.mainNav}>
      <div>
        <span>
          <Link className={styles.mainLogo} href="/">
            OMNILITH
          </Link>
        </span>
      </div>
      <div>
        <Link
          className={styles.rightLink}
          target="_blank"
          href="https://omnilith.infinity.airbit.com/"
        >
          Beats
        </Link>
        <Link className={styles.rightLink} href="/artifacts">
          Blog
        </Link>
      </div>
    </nav>
  );
};

export default Nav;
