import React from "react";
import { createStorefrontApiClient } from "@shopify/storefront-api-client";

const Beats = async () => {
  const client = createStorefrontApiClient({
    storeDomain: "omnilithbeats.myshopify.com",
    apiVersion: "2023-10",
    publicAccessToken: "c7ac853b758015d9a0ce36b597726537",
  });

  const data = await client.request(
    `query getProducts($first: Int) {
      products(first: $first) {
        edges {
          cursor
          node {
            title
          }
        }
      }
    }`,
    {
      variables: {
        first: 1,
      },
    }
  );

  console.log("Client", data.data.products.edges[0].node);

  return <ul>ear</ul>;
};

export default Beats;
