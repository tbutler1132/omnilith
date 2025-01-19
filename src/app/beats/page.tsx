import React from "react";

const Beats = async () => {
  const data = await fetch("http://localhost:7007/beat");
  const beats = await data.json();
  return (
    <ul>
      {beats.map((beat: any) => (
        <li key={beat.id}>{beat.title}</li>
      ))}
    </ul>
  );
};

export default Beats;
