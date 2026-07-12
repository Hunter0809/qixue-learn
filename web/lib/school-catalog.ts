"use client";

import { stageForGrade, type SchoolStage } from "@/lib/profile-storage";

export type OfficialSchool = {
  name: string;
  code: string;
  owner: string;
  city: string;
  stage: SchoolStage;
  level: string;
  note: string;
  sourceType: string;
};

export type OfficialSchoolCatalog = {
  updatedAt: string;
  source: {
    name: string;
    page: string;
    files: { type: string; url: string }[];
    note: string;
  };
  cities: string[];
  byCity: Record<string, OfficialSchool[]>;
};

export async function loadOfficialSchoolCatalog() {
  const response = await fetch("/schools/school-catalog.json");
  if (!response.ok) return null;
  return response.json() as Promise<OfficialSchoolCatalog>;
}

export function officialCities(catalog: OfficialSchoolCatalog | null, baseCities: string[]) {
  if (!catalog) return baseCities;
  return Array.from(new Set([...catalog.cities, ...baseCities])).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function normalizeRegionPart(value: string) {
  return value.trim().replace(/[省市区县]$/g, "");
}

function sameRegion(school: OfficialSchool, province: string, city: string) {
  const schoolCity = school.city || "";
  const owner = school.owner || "";

  if (city) {
    // 当指定了城市时，只显示该城市的学校，不跨城市匹配
    const cityShort = normalizeRegionPart(city);
    return Boolean(
      schoolCity === city ||
      schoolCity.includes(city) ||
      city.includes(schoolCity) ||
      (cityShort.length >= 2 && schoolCity.includes(cityShort))
    );
  }

  // 未指定城市时，按省份模糊匹配（通过主管部门 owner 判断学校所属省份）
  const provinceShort = normalizeRegionPart(province);
  return Boolean(
    owner === province ||
    (provinceShort.length >= 2 && owner.includes(provinceShort))
  );
}

export function officialSchoolsFor(catalog: OfficialSchoolCatalog | null, city: string, grade: string) {
  if (!catalog) return [];
  const stage = stageForGrade(grade);
  const cityShort = normalizeRegionPart(city);
  return Array.from(new Set(
    Object.values(catalog.byCity)
      .flat()
      .filter((school) => {
        const schoolCity = school.city || "";
        return schoolCity === city ||
          schoolCity.includes(city) ||
          city.includes(schoolCity) ||
          (cityShort.length >= 2 && schoolCity.includes(cityShort));
      })
      .filter((school) => school.stage === stage)
      .map((school) => school.name)
  )).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function officialSchoolsForRegion(catalog: OfficialSchoolCatalog | null, region: string, grade: string) {
  if (!catalog) return [];
  const [province, ...cityParts] = region.split(" ");
  const city = cityParts.join(" ");
  const stage = stageForGrade(grade);
  return Array.from(new Set(
    Object.values(catalog.byCity)
      .flat()
      .filter((school) => sameRegion(school, province, city))
      .filter((school) => school.stage === stage)
      .map((school) => school.name)
  )).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function allSchoolsFromCatalog(catalog: OfficialSchoolCatalog): string[] {
  return Array.from(new Set(
    Object.values(catalog.byCity).flat().map((school) => school.name)
  )).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
