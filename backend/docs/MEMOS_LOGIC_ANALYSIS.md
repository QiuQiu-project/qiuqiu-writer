# MemOS（memos）逻辑分析

本文档梳理当前 memos 包的整体架构、核心组件与数据流，便于理解「记忆操作系统」的实现方式。

---

## 一、整体定位

**MemOS（Memory Operating System）** 为 LLM/Agent 提供**可管理的长时记忆**：把记忆从模型权重里的黑盒，变成可存储、可检索、可调度、可审计的资源。核心能力包括：

- **多维度记忆**：文本记忆、偏好记忆、激活记忆（KV）、参数记忆等
- **多用户 / 多 Cube**：按用户和「记忆立方体」隔离
- **记忆生命周期**：生成 → 激活 → 合并 → 归档 → 冻结（由 Scheduler 等模块参与管理）

对外入口主要是：**chat（对话）**、**add（写入记忆）**、**search（检索记忆）**，以及用户/Cube 管理、dump/load 等。

---

## 二、架构分层（自上而下）

```
┌─────────────────────────────────────────────────────────────────┐
│  API 层 (FastAPI)                                                 │
│  ai_router / product_router → ChatHandler / AddHandler /          │
│  SearchHandler / MemoryHandler / ServerRouter                     │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│  MOS 层                                                            │
│  MOS (main.py) / MOSCore (core.py) / MOSProduct (product.py)       │
│  - 多用户 / 多 Cube 编排                                            │
│  - chat / add / search / register_mem_cube / 用户与权限            │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│  MemCube 层                                                        │
│  GeneralMemCube (mem_cube/general.py)                              │
│  - 一个 Cube = text_mem + act_mem + para_mem + pref_mem            │
│  - 从目录/远程初始化、load/dump                                     │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│  记忆实现层                                                        │
│  - text_mem: TreeTextMemory / GeneralTextMemory                    │
│  - pref_mem: PreferenceTextMemory                                  │
│  - act_mem: KV / ActivationMemory                                  │
│  - para_mem: ParametricMemory                                      │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│  基础设施层                                                        │
│  MemReader, Embedder, VecDB, GraphDB, LLM, Reranker, Chunker…     │
└───────────────────────────────────────────────────────────────────┘
```

- **API 层**：把 HTTP 请求转成对 MOS/MOSProduct 的调用。
- **MOS 层**：不直接存数据，只做「哪个用户、哪个 Cube、调用哪个记忆」的编排，以及可选的 **MemScheduler** 调度。
- **MemCube**：真正挂载各类记忆（text/pref/act/para）的容器，一个 Cube 对应一套配置与存储。
- **记忆实现层**：不同记忆类型的具体实现（如 tree_text 用图+向量，general_text 用向量）。
- **基础设施层**：Embedder、向量库、图库、LLM、MemReader 等被记忆和 MOS 共同使用。

---

## 三、核心组件说明

### 3.1 MOS / MOSCore（`mem_os/main.py` + `mem_os/core.py`）

- **MOS**：对外的类名，继承 `MOSCore`，支持无配置时的 `_auto_configure()`（从环境变量读 OPENAI_API_KEY、MOS_TEXT_MEM_TYPE 等），并可选 **PRO_MODE**（复杂问句 CoT 分解）。
- **MOSCore** 职责：
  - **用户与 Cube**：`user_manager` 管理用户、Cube、用户-Cube 权限；`mem_cubes: dict[cube_id, GeneralMemCube]` 为已加载的 Cube。
  - **对话**：`chat_llm`（对话用 LLM）、`chat_history_manager`（按 user 的对话历史）。
  - **记忆读取**：`mem_reader`（MemReader），用于从「多轮对话/文档」中**抽取**结构化记忆再写入 text_mem。
  - **调度**：可选 `mem_scheduler`（GeneralScheduler），消费队列中的 QUERY/ANSWER/ADD/MEM_READ/PREF_ADD 等消息，做长期记忆更新、重组、激活记忆更新等。

主要方法：

- **chat(query, user_id, base_prompt)**  
  - 取该 user 可访问的 Cube → 对每个 Cube 的 `text_mem.search(query, top_k)`（以及可选的 pref_mem）→ 把检索到的记忆拼进 system prompt → 用 `chat_llm.generate` 生成回复 → 可选地把 query/answer 提交给 scheduler（QUERY_LABEL / ANSWER_LABEL）。
- **add(messages, memory_content, doc_path, mem_cube_id, user_id, session_id)**  
  - 若为 tree_text：用 `mem_reader.get_memory()` 把 messages/doc 抽成 `TextualMemoryItem` 再写入对应 Cube 的 `text_mem.add()`；若为 general_text：直接把 content 包装成 item 写入。可选提交 ADD_LABEL / MEM_READ_LABEL / PREF_ADD_LABEL 给 scheduler。
- **search(query, user_id, install_cube_ids, top_k, mode, …)**  
  - 对用户可访问的 Cube 并行做 `text_mem.search` 和 `pref_mem.search`，汇总为 `MOSSearchResult`（text_mem / pref_mem 等列表）。
- **register_mem_cube / unregister_mem_cube**  
  - 向 `mem_cubes` 注册/移除 Cube，并与 `user_manager` 同步（创建 Cube、绑定用户等）。

PRO_MODE 下，MOS 的 `chat()` 会先做 CoT 分解，再对子问题检索、子答案生成，最后用 `_generate_enhanced_response_with_context` 综合成回复，整体仍建立在上述 search + LLM 流程之上。

### 3.2 GeneralMemCube（`mem_cube/general.py`）

- 一个 **MemCube** 绑定一份 `GeneralMemCubeConfig`，并持有四类记忆：
  - **text_mem**：`BaseTextMemory`（TreeTextMemory 或 GeneralTextMemory）
  - **act_mem**：`BaseActMemory`（激活记忆，如 KV cache）
  - **para_mem**：`BaseParaMemory`（参数记忆）
  - **pref_mem**：偏好记忆（也是文本类接口）
- 可从目录 **init_from_dir** 或从远程 **init_from_remote_repo** 初始化；**load/dump** 按 memory_types 选择性加载/持久化。

MOS 的 add/search/chat 最终都落在某个 Cube 的 `text_mem` / `pref_mem` 上。

### 3.3 文本记忆：TreeTextMemory vs GeneralTextMemory

- **GeneralTextMemory**（`memories/textual/general.py`）  
  - 简单向量记忆：用 **Embedder** 把文本打成向量，写入 **VecDB**（如 Qdrant）；search 即向量检索 + 可选 rerank。  
  - 支持从对话中 **extract**（用 LLM 抽成结构化 memory list）再 add。

- **TreeTextMemory**（`memories/textual/tree.py` + tree_text_memory 子包）  
  - 图 + 向量：**Neo4j** 存节点/关系，向量用于检索；检索链一般为：**recall（图+向量/BM25）→ reranker → reasoner**（可选）。  
  - 带有 **MemoryManager**（organize）：重组、合并、归档等，与 Scheduler 的 MEM_ORGANIZE_LABEL 等配合。

两者都实现 `BaseTextMemory` 的 `add / search / get / update / delete / load / dump` 等接口，MOS 层只认接口不关心实现。

### 3.4 MemReader（`mem_reader/`）

- **作用**：从「多轮对话」或「文档列表」中**抽取**结构化记忆（TextualMemoryItem 或树节点等），供 **add** 写入 text_mem。
- **SimpleStructMemReader**（`simple_struct.py`）：用 LLM + Prompt 把对话/文档变成结构化记忆（如 key-value、段落、树节点），可配合 chunker、parser；输出给 tree_text 或 general_text 的 add。
- **StrategyStructMemReader** 等：不同抽取策略，对应不同 MemReader 配置。

MemReader 的 **get_memory(messages_list, type="chat"|"doc", info, mode)** 在 MOSCore.add() 里被调用，用于 tree_text 的写入路径。

### 3.5 MemScheduler（`mem_scheduler/general_scheduler.py`）

- **角色**：后台消费「消息队列」中的调度标签，对记忆做**长期更新与整理**，而不是实时响应单次 chat。
- **消息类型**（部分）：
  - **QUERY_LABEL**：用户发起 query → 更新 query monitor、做 recall、更新 working memory、可选更新激活记忆。
  - **ANSWER_LABEL**：助手回复 → 可能触发记忆合并/归档。
  - **ADD_LABEL**：新增记忆写入后的后续处理（如触发重组）。
  - **MEM_READ_LABEL**：MemReader 产出记忆后的异步写入/调度。
  - **MEM_ORGANIZE_LABEL**：记忆重组（如树结构的合并、归档）。
  - **PREF_ADD_LABEL**：偏好记忆写入后的处理。
- **流程**：Dispatcher 从队列取消息 → 按 label 分发到对应 consumer → consumer 里取当前 `mem_cube`、`mem_reader` 等执行逻辑（long_memory_update_process、replace_working_memory、update_activation_memory 等）。

Scheduler 依赖 MOS 注入的 `mem_cubes`、`mem_reader`；在 API 场景下由 **component_init** 构建并注入到 **MOSProduct**，与 **enable_mem_scheduler** 配置开关一致。

### 3.6 配置与初始化（API 侧）

- **APIConfig**（`api/config.py`）：从环境变量/ Nacos 等汇总 **LLM、Embedder、MemReader、Reranker、VecDB、GraphDB、默认 Cube 配置** 等。
- **init_server()**（`api/handlers/component_init.py`）：  
  - 构建 **graph_db, vector_db, llm, embedder, mem_reader, reranker**，以及 **text_mem / pref_mem** 所需配置；  
  - 组装 **default_cube_config** 和 **MOSProduct** 所需 config；  
  - 创建 **MOSProduct** 实例，注册默认 Cube，可选启动 **mem_scheduler**。  
- 各 **Handler**（ChatHandler、AddHandler、SearchHandler 等）通过 **HandlerDependencies** 拿到 **naive_mem_cube（或 MOS 实例）、llm、mem_reader、mem_scheduler** 等，再转调 MOS 的 chat/add/search。

因此：**API 层 → Handler → MOS(MOSProduct) → MemCube → text_mem/pref_mem**，Scheduler 在后台消费队列，间接操作同一批 MemCube。

---

## 四、关键数据流简图

### 4.1 对话（chat）

```
用户 query
  → ChatHandler.handle_chat()
  → MOS.chat(query, user_id, base_prompt)
  → 取 user 可访问的 mem_cubes
  → 每个 cube.text_mem.search(query, top_k)  [及 pref_mem.search]
  → 合并 memories，拼进 system prompt
  → chat_llm.generate(messages)
  → 可选：向 scheduler 提交 QUERY_LABEL + ANSWER_LABEL
  → 返回回复
```

### 4.2 添加记忆（add）

```
messages / memory_content / doc_path
  → AddHandler.handle_add_memories()
  → MOS.add(messages, memory_content, doc_path, mem_cube_id, user_id, session_id)
  → 若 tree_text：mem_reader.get_memory(messages_list, type="chat"|"doc", …)
  → 得到 TextualMemoryItem 列表
  → mem_cubes[mem_cube_id].text_mem.add(memories)
  → 可选：pref_mem 分支（pref 抽取 + pref_mem.add）
  → 可选：向 scheduler 提交 ADD_LABEL / MEM_READ_LABEL / PREF_ADD_LABEL
```

### 4.3 检索（search）

```
query + user_id + cube_ids + top_k + mode
  → SearchHandler 或直接 MOS.search()
  → 对每个可访问 Cube 并行：text_mem.search(), pref_mem.search()
  → 汇总为 MOSSearchResult { text_mem: [...], pref_mem: [...] }
```

### 4.4 Scheduler 异步流程（概要）

```
QUERY_LABEL / ANSWER_LABEL / ADD_LABEL / …
  → Dispatcher 按 label 分发
  → _query_message_consumer / _answer_message_consumer / _add_message_consumer / …
  → long_memory_update_process：query 监控、recall、replace_working_memory、可选 activation 更新
  → 或 MEM_ORGANIZE：MemoryManager 重组/归档
```

---

## 五、配置要点（MOSConfig / 环境变量）

- **user_id / session_id**：多用户、多会话隔离。
- **chat_model**：对话用 LLM（OpenAI/DeepSeek/Ollama 等）。
- **mem_reader**：MemReader 类型与参数（决定 add 时如何从对话/文档抽记忆）。
- **mem_scheduler**：是否启用 Scheduler 及队列、worker 等配置。
- **user_manager**：用户与 Cube 的存储（如 SQLite/MySQL）。
- **top_k, enable_textual_memory, enable_preference_memory, enable_activation_memory, enable_mem_scheduler, PRO_MODE** 等：控制检索条数、是否启用各类记忆与调度、是否启用 CoT 复杂问句分解。

Cube 侧配置（GeneralMemCubeConfig）包含 text_mem/act_mem/para_mem/pref_mem 的 backend 及各自 config（embedder、vector_db、graph_db、reranker 等），由 **APIConfig.get_default_cube_config()** 与 **init_server()** 统一组装。

---

## 六、小结

- **MOS** 是「记忆操作系统」的编排层：多用户、多 Cube、chat/add/search 入口，可选 Scheduler 与 PRO_MODE。
- **MemCube** 是记忆容器：挂载 text_mem、pref_mem、act_mem、para_mem 四种记忆实现。
- **TreeTextMemory** 与 **GeneralTextMemory** 是两种文本记忆实现（图+向量 vs 纯向量），MemReader 负责从对话/文档中抽取记忆再写入。
- **MemScheduler** 通过消息队列异步执行长期记忆更新、重组与激活记忆更新，与实时 chat/add 解耦。
- **API 层** 通过 Handler 调用 MOS，初始化时由 **component_init** 构建所有依赖并注入 MOSProduct，形成从 HTTP 到记忆读写的完整链路。

以上即为当前 memos 的核心逻辑与数据流概览。
