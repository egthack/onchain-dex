# Rise Sepolia DEX Subgraph

This subgraph indexes events on the Rise Sepolia network.

## Deployment

```
yarn codegen
yarn build
goldsky subgraph deploy <subgraph-name>/<version> --path .
```

## Local development

```shell
docker-compose up -d
bash setup-local.sh
```
