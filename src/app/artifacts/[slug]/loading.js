import styles from "./artifact.module.css";
import LinearProgress from "@mui/material/LinearProgress";

export default function Loading() {
  return (
    <div>
      <LinearProgress color="secondary" />
    </div>
  );
}
