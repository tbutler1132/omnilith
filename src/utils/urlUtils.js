export const convertToEmbedYoutubeUrl = (youtubeUrl) => {
  try {
    const url = new URL(youtubeUrl);
    const { hostname, pathname, searchParams } = url;
    let videoId = "";

    if (hostname.includes("youtube.com") && searchParams.has("v")) {
      videoId = searchParams.get("v");
    } else if (hostname === "youtu.be") {
      videoId = pathname.substring(1);
    } else {
      return youtubeUrl; // Return original URL if unrecognized
    }

    // Construct embed URL with minimal UI
    return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&showinfo=0`;
  } catch {
    return null;
  }
};
