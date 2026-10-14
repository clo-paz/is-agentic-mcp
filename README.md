# Is Agentic MCP

A store your agent can shop. Read-only MCP for [is-agentic.shop](https://is-agentic.shop).

Connect to the public Streamable HTTP endpoint:

`https://fk2efxqdersj346fbaw43tpqwi0qmist.lambda-url.us-west-2.on.aws/mcp`

For a client that supports remote MCP servers, including Cursor and Claude clients with remote HTTP support, add this server entry to its MCP configuration:

```json
{"mcpServers": {
  "is-agentic": {"type":"http","url":"https://fk2efxqdersj346fbaw43tpqwi0qmist.lambda-url.us-west-2.on.aws/mcp"}
}}
```

No API key is needed. Clients must support Streamable HTTP (JSON response mode). Older Claude Desktop versions that only accept a local `command` need a remote-to-stdio bridge instead of this direct URL.

## Tools

- `search_products(query, limit)`: find products in the public catalog.
- `get_product(handle)`: retrieve a product and its available variants.
- `list_collections()`: browse collection names and handles.
- `get_collection(handle, limit)`: retrieve collection products.
- `gift_guide(occasion)`: find gift candidates by occasion.
- `build_cart_link(items, gift_note)`: make a checkout link, not an order.

For gifting, ask the agent to call `gift_guide` for an occasion, inspect a product's variants with `get_product`, and call `build_cart_link` with the chosen variant IDs and optional note. Open the returned link to review the cart and complete checkout yourself. The server cannot place an order, charge a card, or modify the store.

The endpoint and tools are also described in the [store discovery descriptor](https://is-agentic.shop/.well-known/mcp.json) and [agent guide](https://is-agentic.shop/agents.md).

## Develop

Node.js 20. `npm ci && npm test && npm run test:infra` runs protocol and infrastructure checks. The handler in `lambda/handler.js` uses public catalog reads only. `node tests/client.js` exercises a local loopback MCP client. The CDK stack in `infra.js` is an optional deployment template and requires explicit `CDK_DEFAULT_ACCOUNT` and `MCP_BOUNDARY_POLICY_ARN` environment variables for your own guarded AWS account. Do not deploy it to an account you do not administer.

## License

MIT. See [LICENSE](LICENSE).
