"use client";

import Link from "next/link";
import styles from "./components.module.css";
import useMobile from "../hooks/useMobile";

const Nav = () => {
  const isMobile = useMobile();
  return (
    <nav className={styles.mainNav}>
      <div className={styles.mainLogoContainer}>
        <span>
          <Link className={styles.mainLogo} href="/">
            {isMobile ? "OMNI" : "OMNILITH"}
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
