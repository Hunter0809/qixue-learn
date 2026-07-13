import { expect, test } from "@playwright/test";
import { parseAgentJson } from "../lib/agent";

test("保留合法双反斜杠并修复模型产生的 LaTeX 非法转义", () => {
  const slash = String.fromCharCode(92);
  const payload = '{"answer":"合法：' + slash + slash + 'sin(x)；待修复：' + slash + 'Rightarrow、' + slash + 'frac{1}{2}"}';
  expect(parseAgentJson(payload)).toEqual({
    answer: "合法：" + slash + "sin(x)；待修复：" + slash + "Rightarrow、" + slash + "frac{1}{2}"
  });
});