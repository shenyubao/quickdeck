"use client";

import { useEffect, useState } from "react";
import Editor from "react-simple-code-editor";

interface PythonCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function PythonCodeEditor({ value, onChange }: PythonCodeEditorProps) {
  const [Prism, setPrism] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [pythonLoaded, setPythonLoaded] = useState(false);

  useEffect(() => {
    // 只在客户端加载 prismjs
    if (typeof window !== "undefined") {
      // 动态导入 CSS
      // @ts-ignore - CSS 文件没有类型定义
      import("prismjs/themes/prism.css");
      
      // 加载 Prism 和 Python 语法组件
      const loadPrism = async () => {
        try {
          // 先加载 Prism 核心
          const prismModule = await import("prismjs");
          const PrismInstance = prismModule.default;
          
          // 然后加载 Python 语法组件（这会修改全局 Prism.languages）
          // @ts-ignore - prismjs/components 没有类型定义
          await import("prismjs/components/prism-python");
          
          // 验证 Python 语法是否已加载
          const hasPython = !!PrismInstance.languages.python;
          if (hasPython) {
            setPythonLoaded(true);
          } else {
            console.warn("Python grammar not found after import");
          }
          
          setPrism(PrismInstance);
          setMounted(true);
        } catch (error) {
          console.error("Failed to load Prism.js:", error);
          // 如果加载失败，仍然尝试加载基础 Prism
          try {
            const module = await import("prismjs");
            setPrism(module.default);
            setMounted(true);
          } catch (e) {
            console.error("Failed to load Prism.js fallback:", e);
          }
        }
      };
      
      loadPrism();
    }
  }, []);

  if (!mounted || !Prism) {
    // 在加载完成前显示普通文本区域
    return (
      <div
        style={{
          border: "1px solid #d9d9d9",
          borderRadius: "4px",
          backgroundColor: "#fff",
          minHeight: "400px",
          maxHeight: "600px",
          padding: "10px",
          overflow: "auto",
        }}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            minHeight: "380px",
            border: "none",
            outline: "none",
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 14,
            resize: "vertical",
          }}
          placeholder="输入 Python 代码..."
        />
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #d9d9d9",
        borderRadius: "4px",
        backgroundColor: "#fff",
        minHeight: "400px",
        maxHeight: "600px",
        overflow: "auto",
      }}
    >
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={(code) => {
          try {
            // 检查 Python 语法是否可用
            if (Prism && Prism.languages && Prism.languages.python) {
              return Prism.highlight(code, Prism.languages.python, "python");
            }
            // 如果没有 Python 语法，尝试使用通用语法
            if (Prism && Prism.languages && Prism.languages.clike) {
              return Prism.highlight(code, Prism.languages.clike, "clike");
            }
            // 如果都没有，返回原始代码（无高亮）
            return code;
          } catch (error) {
            console.error("Highlight error:", error);
            return code;
          }
        }}
        padding={10}
        style={{
          fontFamily: '"Fira code", "Fira Mono", monospace',
          fontSize: 14,
          minHeight: "400px",
        }}
      />
    </div>
  );
}

