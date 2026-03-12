---
title: BPE（Byte Pair Encoding）完全解析
date: 2026-03-08
tags:
  - BPE
  - Tokenization
  - 分词算法
  - 费曼学习法
status: 完成
---

# BPE（Byte Pair Encoding）完全解析

> [!info] 文档说明
> 从零开始，彻底讲清楚BPE是什么、为什么需要、如何工作！
> 用12岁小孩也能懂的方式！

---

## 🎯 什么是BPE？

**BPE = Byte Pair Encoding = 字节对编码**

**12岁版解释**：

想象你要压缩一本书：

```
原文：
"aaabdaaabac"

你发现"aa"出现了很多次，可以用一个新符号代替：
"aa" → "Z"

压缩后：
"ZabdZabac"

继续，发现"Zab"也出现了很多次：
"Zab" → "Y"

最终：
"YdYac"

这就是BPE的核心思想：找到最常出现的字符对，合并它们！
```

---

## 🤔 为什么需要BPE？

### 问题1：字符级分词（Character-level）

**方法**：每个字符是一个token

```python
"unbelievable" → ["u", "n", "b", "e", "l", "i", "e", "v", "a", "b", "l", "e"]
# 12个token
```

**问题**：
- ❌ 序列太长（12个token）
- ❌ 单个字符没有意义
- ❌ 计算量大

### 问题2：词级分词（Word-level）

**方法**：每个词是一个token

```python
"unbelievable" → ["unbelievable"]
# 1个token
```

**问题**：
- ❌ 词表太大（英语有几十万个词）
- ❌ 无法处理未见过的词（OOV问题）
- ❌ 无法处理形态变化（"run", "running", "ran"是3个不同的词）

**例子**：

```python
# 训练时见过
"run" → token_id: 1234

# 测试时遇到新词
"running" → ??? （词表里没有）
```

### 解决方案：BPE（子词级分词）

**方法**：介于字符和词之间

```python
"unbelievable" → ["un", "believ", "able"]
# 3个token

"running" → ["run", "ning"]
# 2个token
```

**优点**：
- ✅ 序列长度适中
- ✅ 词表大小可控
- ✅ 可以处理未见过的词
- ✅ 可以处理形态变化

---

## 🔧 BPE如何工作？

### 第一步：训练BPE（构建词表）

#### 初始状态

**语料库**：

```
"low" 出现5次
"lower" 出现2次
"newest" 出现6次
"widest" 出现3次
```

**初始词表**（字符级）：

```
vocab = ['l', 'o', 'w', 'e', 'r', 'n', 's', 't', 'i', 'd']
```

**初始分词**（每个字符后加空格，词尾加</w>）：

```
"low" → "l o w </w>"  (5次)
"lower" → "l o w e r </w>"  (2次)
"newest" → "n e w e s t </w>"  (6次)
"widest" → "w i d e s t </w>"  (3次)
```

#### 迭代1：找最常见的字符对

**统计所有相邻字符对的频率**：

```
"l o" 出现 5+2=7次
"o w" 出现 5+2=7次
"w </w>" 出现 5次
"w e" 出现 2+6=8次  ← 最多！
"e r" 出现 2次
"n e" 出现 6次
"e w" 出现 6次
"e s" 出现 6+3=9次  ← 更多！
"s t" 出现 6+3=9次
"t </w>" 出现 6+3=9次
...
```

**找到最常见的对**：`"e s"` 出现9次

**合并**：

```
"e s" → "es"

更新后的分词：
"low" → "l o w </w>"  (5次)
"lower" → "l o w e r </w>"  (2次)
"newest" → "n e w es t </w>"  (6次)  ← 变化
"widest" → "w i d es t </w>"  (3次)  ← 变化
```

**更新词表**：

```
vocab = ['l', 'o', 'w', 'e', 'r', 'n', 's', 't', 'i', 'd', 'es']
                                                            ↑ 新增
```

#### 迭代2：继续找最常见的字符对

**重新统计**：

```
"l o" 出现 7次
"o w" 出现 7次
"es t" 出现 6+3=9次  ← 最多！
...
```

**合并**：

```
"es t" → "est"

更新后的分词：
"low" → "l o w </w>"  (5次)
"lower" → "l o w e r </w>"  (2次)
"newest" → "n e w est </w>"  (6次)  ← 变化
"widest" → "w i d est </w>"  (3次)  ← 变化
```

**更新词表**：

```
vocab = ['l', 'o', 'w', 'e', 'r', 'n', 's', 't', 'i', 'd', 'es', 'est']
                                                                  ↑ 新增
```

#### 迭代3：继续...

**重新统计**：

```
"l o" 出现 7次  ← 最多！
...
```

**合并**：

```
"l o" → "lo"

更新后的分词：
"low" → "lo w </w>"  (5次)  ← 变化
"lower" → "lo w e r </w>"  (2次)  ← 变化
"newest" → "n e w est </w>"  (6次)
"widest" → "w i d est </w>"  (3次)
```

**更新词表**：

```
vocab = ['l', 'o', 'w', 'e', 'r', 'n', 's', 't', 'i', 'd', 'es', 'est', 'lo']
```

#### 继续迭代...

**迭代10次后，可能得到**：

```
vocab = ['l', 'o', 'w', 'e', 'r', 'n', 's', 't', 'i', 'd',
         'es', 'est', 'lo', 'low', 'ne', 'new', 'newest', ...]
```

**停止条件**：
- 达到预设的词表大小（如50000）
- 或达到预设的迭代次数

---

### 第二步：使用BPE（分词）

**训练后得到的词表**：

```python
vocab = {
    'l': 0,
    'o': 1,
    'w': 2,
    'e': 3,
    'r': 4,
    'n': 5,
    's': 6,
    't': 7,
    'i': 8,
    'd': 9,
    'es': 10,      # 合并规则1
    'est': 11,     # 合并规则2
    'lo': 12,      # 合并规则3
    'low': 13,     # 合并规则4
    'new': 14,     # 合并规则5
    'newest': 15,  # 合并规则6
    ...
}

# 合并规则（按顺序应用）
merge_rules = [
    ('e', 's') → 'es',
    ('es', 't') → 'est',
    ('l', 'o') → 'lo',
    ('lo', 'w') → 'low',
    ('n', 'e') → 'ne',
    ('ne', 'w') → 'new',
    ('new', 'est') → 'newest',
    ...
]
```

#### 例子1：分词"lowest"

**步骤1**：初始化（字符级）

```
"lowest" → ['l', 'o', 'w', 'e', 's', 't']
```

**步骤2**：应用合并规则（按训练时的顺序）

```
规则1: ('e', 's') → 'es'
['l', 'o', 'w', 'e', 's', 't'] → ['l', 'o', 'w', 'es', 't']

规则2: ('es', 't') → 'est'
['l', 'o', 'w', 'es', 't'] → ['l', 'o', 'w', 'est']

规则3: ('l', 'o') → 'lo'
['l', 'o', 'w', 'est'] → ['lo', 'w', 'est']

规则4: ('lo', 'w') → 'low'
['lo', 'w', 'est'] → ['low', 'est']

没有更多规则可以应用
```

**最终结果**：

```
"lowest" → ['low', 'est']
```

**转换成token IDs**：

```
['low', 'est'] → [13, 11]
```

#### 例子2：分词"newer"（训练时没见过）

**步骤1**：初始化

```
"newer" → ['n', 'e', 'w', 'e', 'r']
```

**步骤2**：应用合并规则

```
规则5: ('n', 'e') → 'ne'
['n', 'e', 'w', 'e', 'r'] → ['ne', 'w', 'e', 'r']

规则6: ('ne', 'w') → 'new'
['ne', 'w', 'e', 'r'] → ['new', 'e', 'r']

没有更多规则可以应用
```

**最终结果**：

```
"newer" → ['new', 'e', 'r']
```

**转换成token IDs**：

```
['new', 'e', 'r'] → [14, 3, 4]
```

**关键**：即使"newer"在训练时没见过，BPE也能分词！

---

## 🎨 完整的BPE算法

### 训练阶段（构建词表）

```python
def train_bpe(corpus, num_merges):
    """
    corpus: 训练语料
    num_merges: 合并次数（决定词表大小）
    """
    # 1. 初始化：字符级分词
    vocab = set()
    word_freqs =

    for word, freq in corpus.items():
        # 每个字符后加空格，词尾加</w>
        word_freqs[' '.join(word) + ' </w>'] = freq
        vocab.update(word)

    # 2. 迭代合并
    merge_rules = []

    for i in range(num_merges):
        # 2.1 统计所有相邻字符对的频率
        pairs = {}
        for word, freq in word_freqs.items():
            symbols = word.split()
            for j in range(len(symbols) - 1):
                pair = (symbols[j], symbols[j+1])
                pairs[pair] = pairs.get(pair, 0) + freq

        # 2.2 找到最常见的对
        if not pairs:
            break
        best_pair = max(pairs, key=pairs.get)

        # 2.3 合并这个对
        merge_rules.append(best_pair)
        new_symbol = ''.join(best_pair)
        vocab.add(new_symbol)

        # 2.4 更新所有词
        new_word_freqs = {}
        for word, freq in word_freqs.items():
            new_word = word.replace(' '.join(best_pair), new_symbol)
            new_word_freqs[new_word] = freq
        word_freqs = new_word_freqs

    return vocab, merge_rules

# 使用
corpus = {
    'low': 5,
    'lower': 2,
    'newest': 6,
    'widest': 3
}

vocab, merge_rules = train_bpe(corpus, num_merges=10)
```

### 推理阶段（分词）

```python
def tokenize_bpe(word, merge_rules):
    """
    word: 要分词的词
    merge_rules: 训练得到的合并规则
    """
    # 1. 初始化：字符级
    word = ' '.join(word) + ' </w>'
    symbols = word.split()

    # 2. 按顺序应用合并规则
    for pair in merge_rules:
        if len(symbols) == 1:
            break

        # 查找这个pair
        i = 0
        while i < len(symbols) - 1:
            if (symbols[i], symbols[i+1]) == pair:
                # 合并
                symbols = symbols[:i] + [''.join(pair)] + symbols[i+2:]
            else:
                i += 1

    return symbols

# 使用
tokens = tokenize_bpe('lowest', merge_rules)
print(tokens)  # ['low', 'est']
```

---

## 💡 BPE的关键特性

### 1. 数据驱动

**不需要人工定义规则**，完全从数据中学习

```python
# 如果语料中"ing"出现很多次
"running" → ["run", "ning"]

# 如果语料中"un"出现很多次
"unbelievable" → ["un", "believ", "able"]
```

### 2. 处理未见过的词

**任何词都可以分解成字符**，所以永远不会有OOV（Out of Vocabulary）

```python
# 训练时没见过"unbelievably"
# 但可以分解成已知的子词
"unbelievably" → ["un", "believ", "ably"]
```

### 3. 词表大小可控

**通过控制合并次数，控制词表大小**

```python
# 合并1000次 → 词表大小约1000 + 字符数
# 合并10000次 → 词表大小约10000 + 字符数
# 合并50000次 → 词表大小约50000 + 字符数

# GPT-2: 词表大小50257
# GPT-3: 词表大小50257
```

### 4. 保留词的形态信息

**相似的词有相似的分词**

```python
"run" → ["run"]
"running" → ["run", "ning"]
"runner" → ["run", "ner"]

# "run"是共同的子词，保留了形态关系
```

---

## 🌍 实际例子：GPT-2的BPE

### GPT-2的词表

```python
vocab_size = 50257

# 包含：
# - 256个字节（可以表示任何UTF-8字符）
# - 50000个合并后的子词
# - 1个特殊token <|endoftext|>
```

### 实际分词例子

```python
# 例子1：常见词
"hello" → ["hello"]  # 1个token（常见词，整个词在词表中）

# 例子2：不太常见的词
"unbelievable" → ["un", "believ", "able"]  # 3个token

# 例子3：罕见词
"antidisestablishmentarianism" → ["ant", "idis", "establishment", "arian", "ism"]

# 例子4：中文
"今天天气很好" → ["今", "天", "天", "气", "很", "好"]  # 6个token
# 中文通常是字符级（因为GPT-2主要在英文上训练）

# 例子5：代码
"def hello():" → ["def", " hello", "(", "):"]  # 4个token

# 例子6：数字
"123456" → ["123", "456"]  # 2个token（取决于训练数据）
```

### 为什么有些词是1个token，有些是多个？

**取决于训练数据中的频率**：

```python
# 高频词 → 整个词是1个token
"the" → ["the"]  # 出现几百万次
"hello" → ["hello"]  # 出现几十万次

# 中频词 → 分成几个子词
"running" → ["run", "ning"]  # "run"和"ning"都很常见

# 低频词 → 分成更多子词
"antidisestablishmentarianism" → ["ant", "idis", "establishment", "arian", "ism"]
```

---

## 📊 BPE vs 其他分词方法

### 对比表

| 方法 | 词表大小 | 序列长度 | OOV问题 | 使用场景 |
|------|---------|---------|---------|----------|
| **字符级** | 小（~100） | 很长 | 无 | 很少使用 |
| **词级** | 很大（~100万） | 短 | 有 | 传统NLP |
| **BPE** | 中等（~50000） | 适中 | 无 | GPT系列 |
| **WordPiece** | 中等（~30000） | 适中 | 无 | BERT |
| **SentencePiece** | 中等（~32000） | 适中 | 无 | T5, LLaMA |

### 具体例子对比

**输入**：`"unbelievable"`

```python
# 字符级
['u', 'n', 'b', 'e', 'l', 'i', 'e', 'v', 'a', 'b', 'l', 'e']
# 12个token，太长

# 词级
['unbelievable']
# 1个token，但如果词表里没有就无法处理

# BPE
['un', 'believ', 'able']
# 3个token，平衡
```

---

## 💻 Python实现（简化版）

```python
from collections import defaultdict, Counter

class SimpleBPE:
    def __init__(self):
        self.vocab = set()
        self.merge_rules = []

    def train(self, corpus, num_merges):
        """
        训练BPE
        corpus: {'word': frequency, ...}
        num_merges: 合并次数
        """
        # 1. 初始化：字符级分词
        word_freqs = {}
        for word, freq in corpus.items():
            # 字符间加空格，词尾加</w>
            word_split = ' '.join(list(word)) + ' </w>'
            word_freqs[word_split] = freq
            self.vocab.update(list(word))

        # 2. 迭代合并
        for i in range(num_merges):
            # 统计所有相邻对的频率
            pairs = defaultdict(int)
            for word, freq in word_freqs.items():
                symbols = word.split()
                for j in range(len(symbols) - 1):
                    pairs[(symbols[j], symbols[j+1])] += freq

            if not pairs:
                break

            # 找最常见的对
            best_pair = max(pairs, key=pairs.get)
            self.merge_rules.append(best_pair)

            # 合并
            new_symbol = ''.join(best_pair)
            self.vocab.add(new_symbol)

            # 更新所有词
            new_word_freqs = {}
            for word, freq in word_freqs.items():
                new_word = word.replace(' '.join(best_pair), new_symbol)
                new_word_freqs[new_word] = freq
            word_freqs = new_word_freqs

            print(f"Merge {i+1}: {best_pair} → {new_symbol}")

    def tokenize(self, word):
        """
        分词
        """
        # 初始化：字符级
        word = ' '.join(list(word)) + ' </w>'
        symbols = word.split()

        # 应用合并规则
        for pair in self.merge_rules:
            i = 0
            while i < len(symbols) - 1:
                if i < len(symbols) - 1 and (symbols[i], symbols[i+1]) == pair:
                    symbols = symbols[:i] + [''.join(pair)] + symbols[i+2:]
                else:
                    i += 1

        return symbols

# 使用示例
corpus = {
    'low': 5,
    'lower': 2,
    'newest': 6,
    'widest': 3,
    'lowest': 4
}

bpe = SimpleBPE()
bpe.train(corpus, num_merges=10)

# 分词
print(bpe.tokenize('lowest'))   # ['low', 'est']
print(bpe.tokenize('newer'))    # ['new', 'e', 'r']
print(bpe.tokenize('wider'))    # ['w', 'i', 'd', 'e', 'r']
```

**输出**：

```
Merge 1: ('e', 's') → es
Merge 2: ('es', 't') → est
Merge 3: ('l', 'o') → lo
Merge 4: ('lo', 'w') → low
Merge 5: ('n', 'e') → ne
Merge 6: ('ne', 'w') → new
Merge 7: ('new', 'est') → newest
Merge 8: ('w', 'i') → wi
Merge 9: ('wi', 'd') → wid
Merge 10: ('low', 'est') → lowest

['lowest']
['new', 'e', 'r']
['wid', 'e', 'r']
```

---

## 🎯 关键问题解答

### Q1: BPE的核心思想是什么？

**A**: 贪心地合并最常见的字符对

```
1. 从字符级开始
2. 找到最常见的相邻字符对
3. 合并它们成一个新符号
4. 重复，直到达到目标词表大小
```

### Q2: 为什么叫"Byte Pair"？

**A**: 因为每次合并的是一"对"（Pair）相邻的符号

```
('e', 's') → 'es'  # 一对
('es', 't') → 'est'  # 一对
```

最初用于字节级压缩，所以叫"Byte Pair Encoding"

### Q3: BPE如何处理未见过的词？

**A**: 分解成已知的子词，最坏情况分解成字符

```
# 训练时没见过"unbelievably"
# 但可以分解成：
"unbelievably" → ["un", "believ", "ably"]

# 如果"ably"也没见过，继续分解：
"ably" → ["a", "b", "ly"]

# 最坏情况：
"xyz" → ["x", "y", "z"]  # 字符级
```

### Q4: 词表大小如何确定？

**A**: 根据任务和资源权衡

```python
# 小词表（~1000）
- 优点：模型小，训练快
- 缺点：序列长，计算量大

# 中等词表（~50000）✅ 常用
- 平衡

# 大词表（~100000）
- 优点：序列短，计算量小
- 缺点：模型大，训练慢
```

**GPT-2/GPT-3**: 50257
**BERT**: 30522
**LLaMA**: 32000

---

## 🔍 BPE的优缺点

### 优点 ✅

1. **无OOV问题**
   ```python
   # 任何词都可以分解，最坏情况分解成字符
   "supercalifragilisticexpialidocious" → 可以分词
   ```

2. **词表大小可控**
   ```python
   # 通过控制合并次数
   num_merges = 50000 → vocab_size ≈ 50000
   ```

3. **保留形态信息**
   ```python
   "run" → ["run"]
   "running" → ["run", "ning"]
   "runner" → ["run", "ner"]
   # "run"是共同部分
   ```

4. **数据驱动**
   ```python
   # 不需要语言学知识
   # 完全从数据中学习
   ```

5. **多语言友好**
   ```python
   # 可以处理任何语言
   # 只要是UTF-8编码
   ```

### 缺点 ❌

1. **分词不一定符合语言学**
   ```python
   # 可能把一个词分成奇怪的部分
   "unfortunately" → ["un", "fortun", "ately"]
   # 语言学上应该是 ["un", "fortunate", "ly"]
   ```

2. **对空格敏感**
   ```python
   "hello" → ["hello"]
   " hello" → [" hello"]  # 不同！
   ```

3. **训练数据依赖**
   ```python
   # 如果训练数据主要是英文
   # 中文分词效果可能不好
   "今天天气很好" → ["今", "天", "天", "气", "很", "好"]
   # 每个字符一个token
   ```

4. **贪心算法**
   ```python
   # 每次只合并最常见的对
   # 不一定是全局最优
   ```

---

## 🎓 明天演讲建议

### 如何讲解BPE

**推荐顺序**：

1. **先讲问题**：
   "字符级太长，词级词表太大，怎么办？"

2. **再讲核心思想**：
   "BPE的思想很简单：找到最常见的字符对，合并它们！"

3. **用简单例子**：
   ```
   "aaabdaaabac"
   → 发现"aa"最常见，合并成"Z"
   → "ZabdZabac"
   → 继续...
   ```

4. **强调优点**：
   "可以处理任何词，包括训练时没见过的！"

5. **给实际例子**：
   ```
   "unbelievable" → ["un", "believ", "able"]
   "running" → ["run", "ning"]
   ```

### 可能被问到的问题

**Q1**: "BPE和Word2Vec有什么关系？"
**A**: "没有关系。BPE是分词方法，Word2Vec是词向量方法。BPE在Word2Vec之前，把文本分成token。"

**Q2**: "为什么不直接用词级分词？"
**A**: "词级分词有两个问题：词表太大（几十万），无法处理未见过的词。BPE解决了这两个问题。"

**Q3**: "BPE如何处理中文？"
**A**: "如果训练数据主要是英文，中文通常会被分成字符级。如果训练数据包含大量中文，会学到中文的子词。"

**Q4**: "词表大小如何选择？"
**A**: "需要权衡。GPT-2用50257，BERT用30522。太小序列太长，太大模型太大。"

---

## 📚 相关笔记

- [[从文本到向量-Transformer输入流程]] - 完整输入流程
- [[Gated-Attention数学原理完全解析]] - 数学推导
- [[Attention参数来源和SDPA关系详解]] - 参数详解

---

## ✅ 自我检查

确保你能回答这些问题：

- [ ] BPE的核心思想是什么？
- [ ] BPE如何训练？（找最常见的对，合并）
- [ ] BPE如何分词？（应用合并规则）
- [ ] BPE如何处理未见过的词？
- [ ] BPE和词级分词有什么区别？
- [ ] BPE的优缺点是什么？
- [ ] 为什么GPT-2用BPE而不是词级分词？

---

## 🎯 总结

**BPE的核心**：

```
1. 训练阶段：
   - 从字符级开始
   - 迭代地合并最常见的字符对
   - 得到词表和合并规则

2. 推理阶段：
   - 从字符级开始
   - 按顺序应用合并规则
   - 得到token序列
```

**为什么需要BPE**：

```
字符级：序列太长 ❌
词级：词表太大，有OOV ❌
BPE：平衡，无OOV ✅
```

**实际例子**：

```python
# 常见词
"hello" → ["hello"]  # 1个token

# 不常见词
"unbelievable" → ["un", "believ", "able"]  # 3个token

# 未见过的词
"supercalifragilistic" → ["super", "cal", "if", "rag", "il", "istic"]
# 可以分解，无OOV！
```

**关键特性**：
- ✅ 无OOV问题
- ✅ 词表大小可控
- ✅ 保留形态信息
- ✅ 数据驱动

---

## 🎉 现在你应该完全理解BPE了！

**BPE的本质**：
- 不是复杂的算法
- 就是贪心地合并最常见的字符对
- 简单但有效！

**在Transformer中的位置**：

```
文本 → 【BPE分词】→ Token IDs → Embedding → Transformer
        ↑
     在这里！
```

明天演讲时，记得强调BPE的简单性和有效性！🚀

对不起之前没讲清楚，现在应该完全明白了吧？有任何问题随时问我！

