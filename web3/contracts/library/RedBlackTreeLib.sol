// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RedBlackTreeLib
 * @dev Red-Black Treeライブラリ
 *      ・ノードの存在フラグと色を1つのuint8にパッキング（FLAG_EXISTS = 2, FLAG_RED = 1）
 *      ・挿入時のバランス調整（回転処理・再カラーリング）および削除時のバランス調整（fix‐up処理）を実装
 *　　　　　　　　　　　　・キー「0」はセントネル（nil）として扱い、有効なキーは0以外として扱う
 */
library RedBlackTreeLib {
    // 定数: 存在フラグと色のフラグ
    uint8 constant FLAG_EXISTS = 2; // 存在している場合のフラグ (bit1)
    uint8 constant FLAG_RED = 1; // 赤の場合のフラグ (bit0)

    // ノード構造体（ストレージ最適化のため、フラグをパッキング）
    struct Node {
        uint256 parent;
        uint256 left;
        uint256 right;
        uint8 flags; // 存在: FLAG_EXISTS, 色: FLAG_RED (存在かつ赤なら 3, 存在かつ黒なら 2)
    }

    // ツリー全体の構造体
    struct Tree {
        uint256 root; // ツリーが空の場合は 0（セントネル）
        mapping(uint256 => Node) nodes; // キー（例：価格レベル） => ノード
    }

    // --------------------------
    // 基本関数
    // --------------------------

    /**
     * @notice 指定のkeyがツリー内に存在するかチェックする。
     */
    function exists(
        Tree storage tree,
        uint256 key
    ) internal view returns (bool) {
        return (tree.nodes[key].flags & FLAG_EXISTS) != 0;
    }

    /**
     * @notice 指定のkeyのノードが赤かどうかを返す。keyがセントネルの場合は黒とみなす。
     */
    function isRed(
        Tree storage tree,
        uint256 key
    ) internal view returns (bool) {
        if (key == 0) return false;
        return (tree.nodes[key].flags & FLAG_RED) != 0;
    }

    /**
     * @notice 指定のkeyのノードを赤に設定する。
     */
    function setRed(Tree storage tree, uint256 key) internal {
        if (key != 0) {
            tree.nodes[key].flags = FLAG_EXISTS | FLAG_RED;
        }
    }

    /**
     * @notice 指定のkeyのノードを黒に設定する。
     */
    function setBlack(Tree storage tree, uint256 key) internal {
        if (key != 0) {
            tree.nodes[key].flags = FLAG_EXISTS; // 赤フラグをクリア
        }
    }

    // --------------------------
    // 回転処理
    // --------------------------

    /**
     * @notice 左回転を行う。
     * @param x 回転の中心となるノードのkey
     */
    function leftRotate(Tree storage tree, uint256 x) internal {
        uint256 y = tree.nodes[x].right;
        tree.nodes[x].right = tree.nodes[y].left;
        if (tree.nodes[y].left != 0) {
            tree.nodes[tree.nodes[y].left].parent = x;
        }
        tree.nodes[y].parent = tree.nodes[x].parent;
        if (tree.nodes[x].parent == 0) {
            tree.root = y;
        } else if (x == tree.nodes[tree.nodes[x].parent].left) {
            tree.nodes[tree.nodes[x].parent].left = y;
        } else {
            tree.nodes[tree.nodes[x].parent].right = y;
        }
        tree.nodes[y].left = x;
        tree.nodes[x].parent = y;
    }

    /**
     * @notice 右回転を行う。
     * @param y 回転の中心となるノードのkey
     */
    function rightRotate(Tree storage tree, uint256 y) internal {
        uint256 x = tree.nodes[y].left;
        tree.nodes[y].left = tree.nodes[x].right;
        if (tree.nodes[x].right != 0) {
            tree.nodes[tree.nodes[x].right].parent = y;
        }
        tree.nodes[x].parent = tree.nodes[y].parent;
        if (tree.nodes[y].parent == 0) {
            tree.root = x;
        } else if (y == tree.nodes[tree.nodes[y].parent].left) {
            tree.nodes[tree.nodes[y].parent].left = x;
        } else {
            tree.nodes[tree.nodes[y].parent].right = x;
        }
        tree.nodes[x].right = y;
        tree.nodes[y].parent = x;
    }

    // --------------------------
    // 挿入時のバランス調整（Fixup）
    // --------------------------

    /**
     * @notice 挿入後のバランス調整（回転処理および再カラーリング）
     * @param z 挿入した新規ノードのkey
     */
    function insertFixup(Tree storage tree, uint256 z) internal {
        while (z != tree.root && isRed(tree, tree.nodes[z].parent)) {
            uint256 parent = tree.nodes[z].parent;
            uint256 grandparent = tree.nodes[parent].parent;
            if (parent == tree.nodes[grandparent].left) {
                uint256 uncle = tree.nodes[grandparent].right;
                if (isRed(tree, uncle)) {
                    setBlack(tree, parent);
                    setBlack(tree, uncle);
                    setRed(tree, grandparent);
                    z = grandparent;
                } else {
                    if (z == tree.nodes[parent].right) {
                        z = parent;
                        leftRotate(tree, z);
                        parent = tree.nodes[z].parent;
                        grandparent = tree.nodes[parent].parent;
                    }
                    setBlack(tree, parent);
                    setRed(tree, grandparent);
                    rightRotate(tree, grandparent);
                }
            } else {
                uint256 uncle = tree.nodes[grandparent].left;
                if (isRed(tree, uncle)) {
                    setBlack(tree, parent);
                    setBlack(tree, uncle);
                    setRed(tree, grandparent);
                    z = grandparent;
                } else {
                    if (z == tree.nodes[parent].left) {
                        z = parent;
                        rightRotate(tree, z);
                        parent = tree.nodes[z].parent;
                        grandparent = tree.nodes[parent].parent;
                    }
                    setBlack(tree, parent);
                    setRed(tree, grandparent);
                    leftRotate(tree, grandparent);
                }
            }
        }
        setBlack(tree, tree.root);
    }

    // --------------------------
    // 削除時のバランス調整（Fixup）
    // --------------------------
    // ※ 削除アルゴリズムでは、削除対象ノード z を削除した後、その置き換えノード x の色が黒であればfixupを実施します。
    // 標準的なRB-DELETEアルゴリズムに基づいています。
    // セントネル（nil）はキー0として扱い、削除fixup内で x が 0 の場合は、x の親 xp を別途渡します。

    /**
     * @notice _transplant: ツリー内で u を v に置き換えます。
     */
    function _transplant(Tree storage tree, uint256 u, uint256 v) internal {
        uint256 uParent = tree.nodes[u].parent;
        if (uParent == 0) {
            tree.root = v;
        } else if (u == tree.nodes[uParent].left) {
            tree.nodes[uParent].left = v;
        } else {
            tree.nodes[uParent].right = v;
        }
        if (v != 0) {
            tree.nodes[v].parent = uParent;
        }
    }

    /**
     * @notice _subtreeMin: 指定ノードから始まる部分木の最小キーを返す。
     */
    function _subtreeMin(
        Tree storage tree,
        uint256 node
    ) internal view returns (uint256) {
        uint256 current = node;
        while (tree.nodes[current].left != 0) {
            current = tree.nodes[current].left;
        }
        return current;
    }

    /**
     * @notice 削除fixup処理。x が削除後に置き換えられたノード。
     *         xp は x がセントネル（nil、キー0）の場合、その親ノードを示します。
     */
    function _deleteFixup(Tree storage tree, uint256 x, uint256 xp) internal {
        // current: xがnilの場合は xp を用いる
        uint256 current = (x == 0) ? xp : x;
        while (current != tree.root && !isRed(tree, current)) {
            uint256 parent = tree.nodes[current].parent;
            if (current == tree.nodes[parent].left) {
                uint256 w = tree.nodes[parent].right;
                // セントネルチェック：wがnilの場合は処理を継続
                if (w == 0) {
                    current = parent;
                    continue;
                }
                if (isRed(tree, w)) {
                    setBlack(tree, w);
                    setRed(tree, parent);
                    leftRotate(tree, parent);
                    w = tree.nodes[parent].right;
                }
                if (
                    !isRed(tree, tree.nodes[w].left) &&
                    !isRed(tree, tree.nodes[w].right)
                ) {
                    // w の子がどちらも黒（またはnil）なら、w を赤に設定
                    // ただし、wがセントネルの場合はスキップ（通常発生しないはず）
                    if (w != 0) {
                        setRed(tree, w);
                    }
                    current = parent;
                } else {
                    if (!isRed(tree, tree.nodes[w].right)) {
                        if (tree.nodes[w].left != 0) {
                            setBlack(tree, tree.nodes[w].left);
                        }
                        setRed(tree, w);
                        rightRotate(tree, w);
                        w = tree.nodes[parent].right;
                    }
                    // w の色を親の色に合わせ、親と w の右子を黒にする
                    if (isRed(tree, parent)) {
                        setRed(tree, w);
                    } else {
                        setBlack(tree, w);
                    }
                    setBlack(tree, parent);
                    if (tree.nodes[w].right != 0) {
                        setBlack(tree, tree.nodes[w].right);
                    }
                    leftRotate(tree, parent);
                    current = tree.root;
                }
            } else {
                // 鏡像：current が親の右子の場合
                uint256 w = tree.nodes[parent].left;
                if (w == 0) {
                    current = parent;
                    continue;
                }
                if (isRed(tree, w)) {
                    setBlack(tree, w);
                    setRed(tree, parent);
                    rightRotate(tree, parent);
                    w = tree.nodes[parent].left;
                }
                if (
                    !isRed(tree, tree.nodes[w].left) &&
                    !isRed(tree, tree.nodes[w].right)
                ) {
                    if (w != 0) {
                        setRed(tree, w);
                    }
                    current = parent;
                } else {
                    if (!isRed(tree, tree.nodes[w].left)) {
                        if (tree.nodes[w].right != 0) {
                            setBlack(tree, tree.nodes[w].right);
                        }
                        setRed(tree, w);
                        leftRotate(tree, w);
                        w = tree.nodes[parent].left;
                    }
                    if (isRed(tree, parent)) {
                        setRed(tree, w);
                    } else {
                        setBlack(tree, w);
                    }
                    setBlack(tree, parent);
                    if (tree.nodes[w].left != 0) {
                        setBlack(tree, tree.nodes[w].left);
                    }
                    rightRotate(tree, parent);
                    current = tree.root;
                }
            }
        }
        setBlack(tree, current);
    }

    // --------------------------
    // 挿入・削除・探索
    // --------------------------

    /**
     * @notice 指定のkeyが存在しなければツリーに挿入し、バランス調整を実施する。
     */
    function insert(Tree storage tree, uint256 key) internal {
        if (exists(tree, key)) return;
        Node storage newNode = tree.nodes[key];
        newNode.parent = 0;
        newNode.left = 0;
        newNode.right = 0;
        // 新規ノードは赤として挿入（flags = FLAG_EXISTS | FLAG_RED）
        newNode.flags = FLAG_EXISTS | FLAG_RED;
        if (tree.root == 0) {
            tree.root = key;
            // ルートは黒にする
            newNode.flags = FLAG_EXISTS;
        } else {
            uint256 current = tree.root;
            while (true) {
                if (key < current) {
                    if (tree.nodes[current].left == 0) {
                        tree.nodes[current].left = key;
                        newNode.parent = current;
                        break;
                    } else {
                        current = tree.nodes[current].left;
                    }
                } else {
                    if (tree.nodes[current].right == 0) {
                        tree.nodes[current].right = key;
                        newNode.parent = current;
                        break;
                    } else {
                        current = tree.nodes[current].right;
                    }
                }
            }
            insertFixup(tree, key);
        }
    }

    /**
     * @notice ツリーから指定のkeyのノードを削除する。
     *         RB-DELETEアルゴリズムに基づき、削除後にfixup処理を実施します。
     */
    function remove(Tree storage tree, uint256 key) internal {
        if (!exists(tree, key)) return;
        uint256 z = key;
        uint256 y = z;
        bool yOriginalRed = isRed(tree, y);
        uint256 x;
        uint256 xp; // xがセントネルの場合、その親情報を保持
        if (tree.nodes[z].left == 0) {
            xp = tree.nodes[z].parent;
            x = tree.nodes[z].right; // x は nil の可能性あり
            _transplant(tree, z, tree.nodes[z].right);
        } else if (tree.nodes[z].right == 0) {
            xp = tree.nodes[z].parent;
            x = tree.nodes[z].left;
            _transplant(tree, z, tree.nodes[z].left);
        } else {
            y = _subtreeMin(tree, tree.nodes[z].right);
            yOriginalRed = isRed(tree, y);
            xp = tree.nodes[y].parent;
            x = tree.nodes[y].right;
            if (tree.nodes[y].parent == z) {
                if (x != 0) {
                    tree.nodes[x].parent = y;
                } else {
                    xp = y;
                }
            } else {
                _transplant(tree, y, tree.nodes[y].right);
                tree.nodes[y].right = tree.nodes[z].right;
                tree.nodes[tree.nodes[z].right].parent = y;
            }
            _transplant(tree, z, y);
            tree.nodes[y].left = tree.nodes[z].left;
            tree.nodes[tree.nodes[z].left].parent = y;
            // y の色を z の色に引き継ぐ
            if (isRed(tree, z)) {
                setRed(tree, y);
            } else {
                setBlack(tree, y);
            }
        }
        if (!yOriginalRed) {
            _deleteFixup(tree, x, xp);
        }
    }

    /**
     * @notice ツリー内の最小のkeyを返す。ツリーが空の場合は0を返す。
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
     * @notice ツリー内の最大のkeyを返す。ツリーが空の場合は0を返す。
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
     * @notice 指定のkeyの前駆値（Predecessor）を返す。存在しなければ0を返す。
     */
    function getPrevious(
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
     * @notice 指定のkeyの後継値（Successor）を返す。存在しなければ0を返す。
     */
    function getNext(
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
