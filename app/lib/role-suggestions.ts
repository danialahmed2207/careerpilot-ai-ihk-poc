const roles = [
  { title: "IT Support Specialist", keywords: ["it", "support", "helpdesk", "service desk"] },
  { title: "IT-Systemadministrator", keywords: ["it", "system", "admin", "linux", "windows"] },
  { title: "IT-Projektmanager", keywords: ["it", "projekt", "scrum", "koordination"] },
  { title: "IT-Security Specialist", keywords: ["it", "security", "sicherheit", "cyber"] },
  { title: "Cloud Support Specialist", keywords: ["it", "cloud", "support", "aws", "azure"] },
  { title: "Cloud Engineer", keywords: ["it", "cloud", "aws", "azure", "gcp"] },
  { title: "Cloud Administrator", keywords: ["it", "cloud", "admin", "betrieb"] },
  { title: "Cloud Consultant", keywords: ["it", "cloud", "beratung", "consulting"] },
  { title: "DevOps Engineer", keywords: ["it", "devops", "docker", "ci/cd", "automatisierung"] },
  { title: "Junior DevOps Engineer", keywords: ["it", "devops", "junior", "docker"] },
  { title: "Platform Engineer", keywords: ["it", "platform", "kubernetes", "infrastruktur"] },
  { title: "System Engineer", keywords: ["it", "system", "infrastruktur", "betrieb"] },
  { title: "Network Engineer", keywords: ["it", "netzwerk", "network", "routing"] },
  { title: "Softwareentwickler", keywords: ["it", "software", "entwicklung", "developer"] },
  { title: "Frontend Developer", keywords: ["it", "frontend", "react", "javascript"] },
  { title: "Backend Developer", keywords: ["it", "backend", "api", "datenbank"] },
  { title: "Full-Stack Developer", keywords: ["it", "fullstack", "frontend", "backend"] },
  { title: "Data Analyst", keywords: ["it", "daten", "data", "analyse", "sql"] },
  { title: "Business Analyst IT", keywords: ["it", "business", "analyse", "prozesse"] },
  { title: "Technical Consultant", keywords: ["it", "technik", "beratung", "consultant"] },
];

export function suggestRoles(query: string, limit = 6) {
  const normalized = query.toLowerCase().trim();
  if (normalized.length < 2) return [];
  return roles
    .map((role) => {
      const title = role.title.toLowerCase();
      const score = title.startsWith(normalized) ? 5
        : title.includes(normalized) ? 4
          : role.keywords.some((keyword) => keyword.startsWith(normalized)) ? 3
            : role.keywords.some((keyword) => keyword.includes(normalized) || normalized.includes(keyword)) ? 2
              : 0;
      return { title: role.title, score };
    })
    .filter((role) => role.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "de"))
    .slice(0, limit)
    .map((role) => role.title);
}
