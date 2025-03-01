import styles from "./artifact.module.css";
import LinearProgress from "@mui/material/LinearProgress";

export default function Loading() {
  return (
    <div className={styles.loading}>
      <LinearProgress color="secondary" />
    </div>
  );
}
