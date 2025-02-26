export const GET_POSTS = `*[_type == "post"] | order(publishedAt desc) {
    _id,
    title,
    slug,
    mainImage { asset->{url} },
    publishedAt,
    "author": author->name,
    "categories": categories[]->title
  }`;

export const GET_POST = `*[_type == "post" && slug.current == $slug][0] {
    title,
    body,
    mainImage { asset->{url} },
    publishedAt,
    "author": author->name,
    "categories": categories[]->title,
    youtubeVideo
  }`;
