import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { fetchProfile } from "../api/client";
import { mobileFeatures } from "../config/features";
import { MobileCard } from "../components/MobileCard";
import { colors, spacing, typography } from "../styles/theme";
import type { HomeworkFeature, ProfileResponse, Resource } from "../types/domain";

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学"];

type ResourceGroup = {
  key: string;
  subject: string;
  title: string;
  resources: Resource[];
};

type ResourceLevel =
  | { type: "category" }
  | { type: "knowledge"; subject: string }
  | { type: "resource"; subject: string; knowledgeKey: string };

function subjectFromResource(resource: Resource) {
  if (resource.subject && resource.subject !== "综合") return resource.subject;
  const source = (resource.knowledge || resource.title).trim();
  return SUBJECTS.find((subject) => new RegExp(`^${subject}(?:\\s|[:：])`).test(source)) || "";
}

function knowledgeTitle(resource: Resource, subject: string) {
  const source = (resource.knowledge || resource.title).trim();
  if (!subject) return source;
  return source.replace(new RegExp(`^${subject}\\s*[:：]?\\s*`), "").trim() || source;
}

function groupResourcesBySubject(resources: Resource[]) {
  const grouped = new Map<string, Resource[]>();
  resources.forEach((resource) => {
    const subject = subjectFromResource(resource);
    if (!subject) return;
    grouped.set(subject, [...(grouped.get(subject) || []), resource]);
  });
  return Array.from(grouped.entries()).map(([subject, items]) => ({ subject, resources: items }));
}

function groupResourcesByKnowledge(resources: Resource[]) {
  const grouped = new Map<string, ResourceGroup>();
  resources.forEach((resource) => {
    const subject = subjectFromResource(resource);
    if (!subject) return;
    const title = knowledgeTitle(resource, subject);
    const key = `${subject}:${title}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.resources.push(resource);
      return;
    }
    grouped.set(key, { key, subject, title, resources: [resource] });
  });
  return Array.from(grouped.values());
}

export function HomeScreen({ onOpenFeature }: { onOpenFeature: (feature: HomeworkFeature) => void }) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState("");
  const [resourceLevel, setResourceLevel] = useState<ResourceLevel>({ type: "category" });

  useEffect(() => {
    let active = true;
    fetchProfile()
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "加载失败");
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () => groupResourcesBySubject(profile?.recommended_resources || []),
    [profile]
  );
  const currentCategory = resourceLevel.type !== "category"
    ? categories.find((item) => item.subject === resourceLevel.subject)
    : undefined;
  const knowledgeGroups = useMemo(
    () => groupResourcesByKnowledge(currentCategory?.resources || []),
    [currentCategory]
  );
  const currentKnowledge = resourceLevel.type === "resource"
    ? knowledgeGroups.find((item) => item.key === resourceLevel.knowledgeKey)
    : undefined;

  function goBackResourceLevel() {
    if (resourceLevel.type === "resource") {
      setResourceLevel({ type: "knowledge", subject: resourceLevel.subject });
      return;
    }
    setResourceLevel({ type: "category" });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.brand}>
        <Image source={require("../../assets/icon.png")} style={styles.logo as ImageStyle} />
        <View style={styles.brandText}>
          <Text numberOfLines={1} style={styles.title}>启学智伴</Text>
          <Text numberOfLines={1} style={styles.subtitle}>移动端学习工作台</Text>
        </View>
      </View>

      {!profile && !error ? <ActivityIndicator color={colors.blue} /> : null}
      {error ? <MobileCard title="连接后端失败" meta={error} /> : null}

      {profile ? (
        <>
          <MobileCard title="学习进度" meta={`${profile.completedKnowledge}/${profile.totalKnowledge}`}>
            <Text numberOfLines={1} style={styles.body}>连续学习 {profile.streakDays} 天，当前进度 {profile.progress}%</Text>
          </MobileCard>

          <Section title="功能模块">
            {mobileFeatures.map((item) => (
              <MobileCard
                key={item.feature}
                title={item.title}
                meta={item.subject}
                onPress={() => onOpenFeature(item.feature)}
              >
                <Text numberOfLines={1} style={styles.body}>{item.placeholder}</Text>
              </MobileCard>
            ))}
          </Section>

          <Section title="今日任务">
            {profile.today_tasks.slice(0, 4).map((task) => (
              <MobileCard key={task.id} title={task.title} meta={`${task.knowledge} · ${task.minutes} 分钟`}>
                <Text numberOfLines={1} style={styles.body}>
                  {task.status === "done" ? "已完成" : "待完成"} · {task.exercises} 题
                </Text>
              </MobileCard>
            ))}
            {!profile.today_tasks.length ? <MobileCard title="暂无今日任务" meta="完成一次学习后自动生成" /> : null}
          </Section>

          <Section title="薄弱知识点">
            {profile.weak_points.slice(0, 3).map((point) => (
              <MobileCard key={point.id} title={point.name} meta={`掌握 ${Math.round(point.mastery)}%`}>
                <Text numberOfLines={1} style={styles.body}>薄弱度 {Math.round(point.severity)}%</Text>
              </MobileCard>
            ))}
            {!profile.weak_points.length ? <MobileCard title="暂无薄弱知识点" meta="开始答题后自动同步生成" /> : null}
          </Section>

          <Section title="推荐资源主要类别">
            {resourceLevel.type !== "category" ? (
              <Pressable onPress={goBackResourceLevel} style={styles.backButton}>
                <Text numberOfLines={1} style={styles.backText}>返回上一级</Text>
              </Pressable>
            ) : null}
            {resourceLevel.type === "category" ? categories.map((category) => (
              <MobileCard
                key={category.subject}
                title={`${category.subject}资源类别`}
                meta={`${groupResourcesByKnowledge(category.resources).length} 个知识点`}
                onPress={() => setResourceLevel({ type: "knowledge", subject: category.subject })}
              >
                <Text numberOfLines={1} style={styles.body}>点击进入该学科的知识点分类</Text>
              </MobileCard>
            )) : null}
            {resourceLevel.type === "category" && !categories.length ? (
              <MobileCard title="暂无推荐资源" meta="产生薄弱点后自动同步" />
            ) : null}
            {resourceLevel.type === "knowledge" ? knowledgeGroups.map((group) => (
              <MobileCard
                key={group.key}
                title={`${group.subject} · ${group.title}`}
                meta={`${group.resources.length} 个资源`}
                onPress={() => setResourceLevel({ type: "resource", subject: group.subject, knowledgeKey: group.key })}
              >
                <Text numberOfLines={1} style={styles.body}>点击查看该知识点下的资源</Text>
              </MobileCard>
            )) : null}
            {resourceLevel.type === "resource" ? currentKnowledge?.resources.map((resource) => (
              <MobileCard
                key={resource.id}
                title={resource.title}
                meta={`${currentKnowledge.subject} · ${currentKnowledge.title}`}
              >
                <Text numberOfLines={1} style={styles.body}>{resource.summary}</Text>
              </MobileCard>
            )) : null}
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text numberOfLines={1} style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
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
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  brandText: {
    flex: 1,
    minWidth: 0
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 8
  },
  title: {
    ...typography.screenTitle,
    color: colors.blue
  },
  subtitle: {
    ...typography.meta,
    color: colors.muted
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    ...typography.title,
    color: colors.blue
  },
  body: {
    ...typography.body,
    color: colors.muted
  },
  backButton: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  backText: {
    ...typography.meta,
    color: colors.blue
  }
});
