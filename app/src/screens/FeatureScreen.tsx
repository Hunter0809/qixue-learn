import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { runHomework } from "../api/client";
import { getMobileFeature } from "../config/features";
import { MobileCard } from "../components/MobileCard";
import { colors, spacing, typography } from "../styles/theme";
import type { HomeworkFeature, HomeworkResponse } from "../types/domain";

export function FeatureScreen({ feature, onBack }: { feature: HomeworkFeature; onBack: () => void }) {
  const config = getMobileFeature(feature);
  const [subject, setSubject] = useState(config.subject);
  const [content, setContent] = useState("");
  const [result, setResult] = useState<HomeworkResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await runHomework({
        feature: config.feature,
        subject: subject.trim() || config.subject,
        content: trimmed,
        forceAI: false
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text numberOfLines={1} style={styles.backText}>返回</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.title}>{config.title}</Text>
          <Text numberOfLines={1} style={styles.subtitle}>与网页端共享同一后端输出</Text>
        </View>
      </View>

      <MobileCard title="输入">
        <TextInput
          onChangeText={setSubject}
          placeholder="学科"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={subject}
        />
        <TextInput
          multiline
          onChangeText={setContent}
          placeholder={config.placeholder}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.textarea]}
          textAlignVertical="top"
          value={content}
        />
        <Pressable disabled={!content.trim() || loading} onPress={submit} style={[styles.submit, (!content.trim() || loading) && styles.disabled]}>
          <Text numberOfLines={1} style={styles.submitText}>{loading ? "处理中" : "开始分析"}</Text>
        </Pressable>
      </MobileCard>

      {loading ? <ActivityIndicator color={colors.blue} /> : null}
      {error ? <MobileCard title="请求失败" meta={error} /> : null}

      {result ? (
        <View style={styles.resultStack}>
          <MobileCard title={result.title} meta={result.feature}>
            <Text style={styles.answer}>{result.answer}</Text>
          </MobileCard>
          {result.sections?.map((section) => (
            <MobileCard key={section.title} title={section.title} meta={`${section.items.length} 项`}>
              {section.items.slice(0, 6).map((item, index) => (
                <Text key={`${section.title}_${index}`} numberOfLines={2} style={styles.body}>{item}</Text>
              ))}
            </MobileCard>
          ))}
          {result.knowledge.length ? (
            <MobileCard title="知识点" meta={`${result.knowledge.length} 个`}>
              {result.knowledge.slice(0, 3).map((item) => (
                <Text key={item} numberOfLines={1} style={styles.body}>{item}</Text>
              ))}
            </MobileCard>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  title: {
    ...typography.screenTitle,
    color: colors.blue
  },
  subtitle: {
    ...typography.meta,
    color: colors.muted
  },
  backButton: {
    minWidth: 56,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  backText: {
    ...typography.meta,
    color: colors.blue
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: "#fffdf7",
    ...typography.body
  },
  textarea: {
    minHeight: 120,
    paddingTop: spacing.sm
  },
  submit: {
    minHeight: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blue
  },
  disabled: {
    opacity: 0.45
  },
  submitText: {
    ...typography.meta,
    color: "#ffffff"
  },
  resultStack: {
    gap: spacing.sm
  },
  answer: {
    ...typography.body,
    color: colors.text
  },
  body: {
    ...typography.body,
    color: colors.muted
  }
});
