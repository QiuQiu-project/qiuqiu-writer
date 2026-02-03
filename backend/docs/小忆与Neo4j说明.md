# 「小忆」系统提示词存放位置与 Neo4j 查看方式

## 一、这段话在哪里存放？

你看到的「你好！我是MemOS🧚，你可以叫我小忆🧚。我是由记忆张量（MemTensor Technology Co., Ltd.）开发的记忆操作系统助手，致力于为AI赋予类人的长期记忆能力。」是**基于系统提示词由模型生成的自我介绍**，并非某处存好的固定文案。

**系统提示词（含「小忆」设定）的代码位置：**

| 内容 | 文件 | 变量/函数 |
|------|------|-----------|
| 角色与昵称（MemOS🧚 / 小忆🧚） | `backend/src/memos/templates/mos_prompts.py` | `MEMOS_PRODUCT_BASE_PROMPT`（约第 65–122 行） |
| 拼成完整 system prompt | 同上 | `get_memos_prompt(date, tone, verbosity, mode)`（约第 246 行） |
| 使用该 prompt 的地方 | `backend/src/memos/mem_os/product.py` | `_build_base_system_prompt`、`_build_enhance_system_prompt` 等，内部调用 `get_memos_prompt` |

`MEMOS_PRODUCT_BASE_PROMPT` 里有一行类似：

```text
- Role: You are MemOS🧚, nickname Little M(小忆🧚) — an advanced Memory Operating System assistant by 记忆张量(MemTensor Technology Co., Ltd.) ...
```

所以：**「小忆」和 MemOS 的设定来自代码里的 `mos_prompts.py`，不是来自数据库，也不是来自 Neo4j。**

---

## 二、「小忆」是否在 Neo4j 里？

**不在。** Neo4j 在本项目里只存**记忆图（TreeTextMemory）**，例如：

- 节点：记忆节点（Memory 等），属性如 `memory`（文本）、`embedding`、`created_at`、`user_name` 等  
- 边：记忆之间的层级、引用等关系  

**不**在 Neo4j 里存的内容包括：

- 助手昵称「小忆」
- 系统提示词 / 开场白文案  

这些都在代码 `backend/src/memos/templates/mos_prompts.py` 里。

---

## 三、Neo4j 的查看方式

### 1. 环境变量（连接信息）

在 `backend/.env` 或环境中通常会有：

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=12345678
NEO4J_DB_NAME=neo4j
```

若使用共享库，可能还有 `NEO4J_DB_NAME=shared-tree-textual-memory` 等，以 `api/config.py` 里 `get_neo4j_*` 为准。

### 2. 用 Neo4j Browser 查看（推荐）

1. 安装并启动 Neo4j（Desktop 或社区版均可）。  
2. 浏览器打开：`http://localhost:7474`（默认端口）。  
3. 用上面的 `NEO4J_USER` / `NEO4J_PASSWORD` 登录。  
4. 在顶部选择要看的数据库（与 `NEO4J_DB_NAME` 一致）。  
5. 在输入框里写 Cypher 查询并执行，例如：

```cypher
// 查看所有节点标签
CALL db.labels();

// 查看所有关系类型
CALL db.relationshipTypes();

// 查看前 25 个节点（示例：Memory 节点）
MATCH (n:Memory) RETURN n LIMIT 25;

// 查看节点数量
MATCH (n:Memory) RETURN count(n) AS count;
```

### 3. 用 cypher-shell 命令行查看

若已安装 Neo4j 且 `cypher-shell` 在 PATH 中：

```bash
# 连接（按你本机 NEO4J_URI / 用户名/密码/库名 修改）
cypher-shell -a bolt://localhost:7687 -u neo4j -p 12345678 -d neo4j

# 进入后执行 Cypher，例如：
# CALL db.labels();
# MATCH (n) RETURN n LIMIT 10;
```

### 4. 本项目里 Neo4j 存的是什么

- **图数据库**：记忆节点 + 关系，用于 TreeTextMemory 的检索与重组。  
- **不包含**：系统提示词、小忆昵称、开场白等；这些在 `backend/src/memos/templates/mos_prompts.py`。

若要改「小忆」或 MemOS 的自我介绍，请直接改 `mos_prompts.py` 里的 `MEMOS_PRODUCT_BASE_PROMPT`（以及如需增强时的 `MEMOS_PRODUCT_ENHANCE_PROMPT`）。
