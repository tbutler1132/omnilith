import styles from "./page.module.css";
import { redirect } from "next/navigation";

const Home = () => {
  redirect("/artifacts");
};

export default Home;
