import styles from "./beats.module.css";

const Beats = () => {
  return (
    <div style={{ height: "100vh" }}>
      <h1 className={styles.glowingText}>Beats</h1>
      <iframe
        id="airbit_infinity"
        src="https://omnilith.infinity.airbit.com?config_id=16353&embed=1"
        width="100%"
        height="90%"
        frame-border="0"
        scrolling="no"
      ></iframe>
    </div>
  );
};

export default Beats;
