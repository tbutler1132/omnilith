"use client";
import styles from "./sacred.module.css";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import ScrollTrigger from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import ScrambleTextPlugin from "gsap/ScrambleTextPlugin";
import MorphSVGPlugin from "gsap/MorphSVGPlugin";

const Sacred = () => {
  gsap.registerPlugin(ScrollTrigger);
  gsap.registerPlugin(DrawSVGPlugin);
  gsap.registerPlugin(ScrambleTextPlugin);
  gsap.registerPlugin(MorphSVGPlugin);

  useGSAP(() => {
    const desireTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: "#desireSection",
        end: "=+10000px",
        pin: true,
        scrub: 1,
        // markers: true
      },
    });

    // Draw lines from desire to creation
    desireTimeline.from("#line-from-desire-1", {
      drawSVG: 0,
    });

    desireTimeline.from("#line-from-desire-2", {
      drawSVG: 0,
    });

    desireTimeline.from("#line-from-desire-arrowhead", {
      drawSVG: 0,
    });

    desireTimeline.from("#line-from-desire-3", {
      drawSVG: 0,
    });

    //Power creation when arrow reaches it
    desireTimeline.to("#creation-rectangle", {
      stroke: "cyan",
    });

    desireTimeline.to(
      "#creations-text",
      {
        color: "cyan",
      },
      "<"
    );

    //Scramble text
    desireTimeline.to("#scramble-text-test", {
      scrambleText: {
        text: "also produce",
      },
      color: "#ff8400",
    });

    // desireTimeline.to("#desire-text", {
    //   opacity: 0,
    // });

    desireTimeline.from("#line-from-creation-1", {
      drawSVG: 0,
    });

    desireTimeline.from("#line-from-creation-2", {
      drawSVG: 0,
    });

    desireTimeline.from("#line-from-creation-arrowhead", {
      drawSVG: 0,
    });

    desireTimeline.from("#line-from-creation-3", {
      drawSVG: 0,
    });

    const systemTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: "#system-section",
        end: "=+10000px",
        pin: true,
        scrub: 1,
      },
    });

    // systemTimeline.to("#heart2", {
    //   morphSVG: "#heart-circle",
    // });

    // systemTimeline.to("#heart2", {
    //   morphSVG: "#heart-circle-little",
    //   fill: "#FF5B5B",
    //   y: 50,
    // });

    // systemTimeline.from(
    //   "#big-circle",
    //   {
    //     drawSVG: 0,
    //   },
    //   "<"
    // );

    // systemTimeline.from(".brand-system", {
    //   opacity: 0,
    // });

    // systemTimeline.to(".brand-system", {
    //   stroke: "cyan",
    // });
  }, []);

  return (
    <>
      <section id={styles.missionSection}>
        <p className={styles.testClass}>I think this blah blah</p>
      </section>
      <section id="desireSection">
        <div id="desire-container">
          <div className="svg-container">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              id="desire-svg"
              viewBox="-100 0 1250 748.09"
            >
              <g>
                <rect
                  x="0.5"
                  y="194.5"
                  width="394"
                  strokeWidth="5"
                  height="394"
                  rx="20"
                  stroke="grey"
                  id="creation-rectangle"
                />
                {/* <path
                  d="M394,195v393H1V195h393M395,194H0v395h395V194h0Z"
                  stroke="white"
                /> */}
              </g>
              <path
                d="M904.5,589l-28.64-28.41c-101.71-100.53-168.86-166.83-168.86-248.19,0-66.3,47.8-118.39,108.62-118.39,34.36,0,67.35,17.44,88.88,44.99,21.53-27.55,54.51-44.99,88.88-44.99,60.83,0,108.62,52.09,108.62,118.39,0,81.37-67.15,147.67-168.86,248.41l-28.64,28.2Z"
                fill="none"
                stroke="#FF5B5B"
                strokeWidth="5"
                id="desire-heart"
              />
              <line
                x1="904.5"
                y1="238.5"
                x2="904.5"
                y2="79.5"
                fill="none"
                stroke="#fff"
                strokeWidth={3}
                id="line-from-desire-1"
                className="desire-line"
              />
              <path
                d="M904.5,79.5H197.5h707Z"
                fill="none"
                stroke="white"
                id="line-from-desire-2"
                className="desire-line"
              />
              <g>
                <line
                  x1="197.5"
                  y1="182.43"
                  x2="197.5"
                  y2="80"
                  fill="none"
                  stroke="#fff"
                  id="line-from-desire-3"
                  className="desire-line"
                />
                <path
                  d="M197.5,194.5c2.11-5.68,5.7-12.73,9.51-17.09l-9.51,3.44-9.51-3.44c3.81,4.37,7.4,11.42,9.51,17.09Z"
                  stroke="white"
                  id="line-from-desire-arrowhead"
                  className="desire-line"
                />
              </g>
              <line
                x1="197.2"
                y1="588.59"
                x2="197.2"
                y2="747.59"
                fill="none"
                stroke="white"
                id="line-from-creation-1"
                className="creation-line"
              />
              <path
                d="M197.2,747.59h707H197.2Z"
                fill="none"
                stroke="white"
                strokeMiterlimit="10"
                id="line-from-creation-2"
                className="creation-line"
              />
              <g>
                <line
                  x1="904.22"
                  y1="600.66"
                  x2="904.5"
                  y2="747.5"
                  fill="none"
                  stroke="#fff"
                  id="line-from-creation-3"
                  className="creation-line"
                />
                <path
                  d="M904.2,588.59c-2.1,5.68-5.68,12.74-9.48,17.11l9.51-3.46,9.52,3.42c-3.82-4.36-7.43-11.4-9.54-17.08Z"
                  stroke="white"
                  id="line-from-creation-arrowhead"
                  className="creation-line"
                />
              </g>
            </svg>
          </div>
          <div className="text-container">
            <span id="creations-text">Creations</span>
            <span id="scramble-text-test">are powered by </span>
            <span id="desire-text">Desire</span>
          </div>
        </div>
      </section>
      <section id="system-section">
        <div id="system-container">
          <div className="text-container">Text</div>
          <div className="svg-container">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="-200 0 1250 884"
              aria-labelledby="svgTitle"
            >
              <path
                d="M441.5,639 l-28.64,-28.41 c-101.71,-100.53 -168.86,-166.83 -168.86,-248.19 0,-66.3 47.8,-118.39 108.62,-118.39 34.36,0 67.35,17.44 88.88,44.99 21.53,-27.55 54.51,-44.99 88.88,-44.99 60.83,0 108.62,52.09 108.62,118.39 0,81.37 -67.15,147.67 -168.86,248.41 l-28.64,28.2 Z"
                fill="none"
                stroke="#FF5B5B"
                strokeWidth="2"
                id="system-heart"
              />
              <circle
                cx="442"
                cy="442"
                r="30"
                fill="#ff5559"
                id="system-core"
              />
              <circle
                cx="442"
                cy="442"
                r="441.5"
                fill="none"
                stroke="#fff"
                strokeWidth="4"
                id="system-boundary"
              />
              <rect
                x="394.5"
                y="186.5"
                width="95"
                height="95"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                rx="20"
                className="system-entity"
              />
              <rect
                x="615.5"
                y="394.5"
                width="95"
                height="95"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                rx="20"
                className="system-entity"
              />
              <rect
                x="394.5"
                y="602.5"
                width="95"
                height="95"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                rx="20"
                className="system-entity"
              />
              <rect
                x="173.5"
                y="394.5"
                width="95"
                height="95"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                rx="20"
                className="system-entity"
              />
              <line
                x1="441.5"
                y1="412.5"
                x2="441.5"
                y2="281.5"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                className="system-entity"
              />
              <line
                x1="441.5"
                y1="603"
                x2="441.5"
                y2="472"
                fill="none"
                stroke="red"
                strokeMiterlimit="10"
                className="system-core-line"
              />
              <path
                d="M412.5,442.5l-144-1,144,1Z"
                fill="none"
                stroke="red"
                strokeMiterlimit="10"
                className="system-core-line"
              />
              <line
                x1="615.5"
                y1="442.5"
                x2="471.95"
                y2="441.7"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                className="system-core-line"
              />
              <line
                x1="394.5"
                y1="602.5"
                x2="268.5"
                y2="489.5"
                fill="none"
                stroke="red"
                strokeMiterlimit="10"
                className="system-entity-line"
              />
              <line
                x1="615.5"
                y1="394.5"
                x2="489.95"
                y2="281.77"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                className="system-entity-line"
              />
              <line
                x1="268.5"
                y1="394.5"
                x2="394.05"
                y2="281.28"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                className="system-entity-line"
              />
              <line
                x1="489.18"
                y1="602.88"
                x2="615.5"
                y2="489.5"
                fill="none"
                stroke="#fff"
                strokeMiterlimit="10"
                className="system-entity-line"
              />
            </svg>
          </div>
        </div>
      </section>
      <section id="mission-section">
        <div id="mission-container">Mission Container</div>
      </section>
    </>
  );
};

export default Sacred;
