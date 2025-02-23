
## Required Environment

To run this project, the following versions of Node.js and pnpm are required:

- **Node.js**: Version 20.x
- **pnpm**: Version 9.x

Using these versions ensures that all features of the project function correctly. For installation instructions, please refer to the official documentation of Node.js and pnpm.


## Installation Instructions

To ensure all necessary libraries are installed for each part of the project, please execute the following commands in their respective directories:

1. **Root Directory (`mud`)**:
   Navigate to the root directory and run the following command:
   ```bash
   cd mud
   pnpm install
   ```

2. **Client Package (`packages/client`)**:
   Navigate to the client package directory and run the following command:
   ```bash
   cd packages/client
   pnpm install
   ```

3. **Contracts Package (`packages/contracts`)**:
   Navigate to the contracts package directory and run the following command:
   ```bash
   cd packages/contracts
   pnpm install
   ```

Executing these commands will ensure that all required libraries are installed for each component of the project. Please refer to the official documentation for further details on library management and installation.

## Running the Project

To launch the project, simply execute the following command within the `mud` directory:

  ```
  pnpm dev
  ```



## Project Architecture

The architecture of this project is designed following the principles of MUD (Modular Unified Design), ensuring a seamless integration between the frontend and the blockchain components. The project is divided into distinct packages, each serving a specific role:

1. **Client Package (`packages/client`)**:
   The client package is responsible for the frontend operations of the project. It acts as the user interface, allowing users to interact with the blockchain through a web-based application. This package is built using modern web technologies to ensure a responsive and user-friendly experience.

2. **Contracts Package (`packages/contracts`)**:
   The contracts package contains the on-chain smart contracts. These contracts are deployed on the blockchain and handle the core logic and data management of the project. They are designed to be secure, efficient, and scalable, adhering to the best practices in smart contract development.

By adhering to the MUD design philosophy, this project ensures modularity, reusability, and maintainability, allowing for easy updates and enhancements as the project evolves.
