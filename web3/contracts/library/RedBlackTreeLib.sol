// RedBlackTreeLib.sol
library RedBlackTreeLib {
    struct Node {
        uint256 parent;
        uint256 left;
        uint256 right;
        bool red;
        bool exists;
    }
    struct Tree {
        uint256 root; // 0 if tree is empty
        mapping(uint256 => Node) nodes; // Mapping: key (price level) => Node
    }

    /**
     * @notice Inserts a key into the tree if it does not already exist.
     * Balancing operations are omitted.
     */
    function insert(Tree storage tree, uint256 key) internal {
        if (tree.nodes[key].exists) return;
        tree.nodes[key] = Node({
            parent: 0,
            left: 0,
            right: 0,
            red: true,
            exists: true
        });
        if (tree.root == 0) {
            tree.root = key;
            tree.nodes[key].red = false; // Root is black.
        } else {
            uint256 current = tree.root;
            while (true) {
                if (key < current) {
                    if (tree.nodes[current].left == 0) {
                        tree.nodes[current].left = key;
                        tree.nodes[key].parent = current;
                        break;
                    } else {
                        current = tree.nodes[current].left;
                    }
                } else {
                    if (tree.nodes[current].right == 0) {
                        tree.nodes[current].right = key;
                        tree.nodes[key].parent = current;
                        break;
                    } else {
                        current = tree.nodes[current].right;
                    }
                }
            }
        }
    }

    /**
     * @notice Removes a key from the tree. Balancing is omitted.
     */
    function remove(Tree storage tree, uint256 key) internal {
        if (!tree.nodes[key].exists) return;
        delete tree.nodes[key];
        if (tree.root == key) {
            tree.root = 0;
        }
    }

    /**
     * @notice Checks if a key exists in the tree.
     */
    function exists(
        Tree storage tree,
        uint256 key
    ) internal view returns (bool) {
        return tree.nodes[key].exists;
    }

    /**
     * @notice Returns the minimum key in the tree.
     */
    function getMin(Tree storage tree) internal view returns (uint256) {
        uint256 current = tree.root;
        if (current == 0) return 0;
        while (tree.nodes[current].left != 0) {
            current = tree.nodes[current].left;
        }
        return current;
    }

    /**
     * @notice Returns the maximum key in the tree.
     */
    function getMax(Tree storage tree) internal view returns (uint256) {
        uint256 current = tree.root;
        if (current == 0) return 0;
        while (tree.nodes[current].right != 0) {
            current = tree.nodes[current].right;
        }
        return current;
    }

    /**
     * @notice Returns the predecessor of a given key.
     * For simplicity, returns 0 if none exists.
     */
    function getPredecessor(
        Tree storage tree,
        uint256 key
    ) internal view returns (uint256) {
        uint256 current = key;
        if (tree.nodes[current].left != 0) {
            current = tree.nodes[current].left;
            while (tree.nodes[current].right != 0) {
                current = tree.nodes[current].right;
            }
            return current;
        }
        uint256 parent = tree.nodes[current].parent;
        while (parent != 0 && current == tree.nodes[parent].left) {
            current = parent;
            parent = tree.nodes[parent].parent;
        }
        return parent;
    }

    /**
     * @notice Returns the successor of a given key.
     * For simplicity, returns 0 if none exists.
     */
    function getSuccessor(
        Tree storage tree,
        uint256 key
    ) internal view returns (uint256) {
        uint256 current = key;
        if (tree.nodes[current].right != 0) {
            current = tree.nodes[current].right;
            while (tree.nodes[current].left != 0) {
                current = tree.nodes[current].left;
            }
            return current;
        }
        uint256 parent = tree.nodes[current].parent;
        while (parent != 0 && current == tree.nodes[parent].right) {
            current = parent;
            parent = tree.nodes[parent].parent;
        }
        return parent;
    }
}
