import heroWorkbench from './hero-workbench.png'
import heroAiTutor from './hero-ai-tutor.png'
import heroPracticeLab from './hero-practice-lab.png'
import heroLearningPath from './hero-learning-path.png'
import heroKnowledgeBase from './hero-knowledge-base.png'
import cardCodeReview from './card-code-review.png'
import cardAlgorithmMap from './card-algorithm-map.png'
import cardDebugConsole from './card-debug-console.png'
import cardNoteCapture from './card-note-capture.png'
import cardAiAgent from './card-ai-agent.png'
import cardProgressChart from './card-progress-chart.png'
import emptyNoActivity from './empty-no-activity.png'
import emptyNoLessons from './empty-no-lessons.png'
import emptyNoPractice from './empty-no-practice.png'
import emptyNoKnowledge from './empty-no-knowledge.png'
import emptyNoSearchResults from './empty-no-search-results.png'
import emptyOfflineMode from './empty-offline-mode.png'
import streakBadge from './streak-badge.png'
import focusBadge from './focus-badge.png'
import reviewBadge from './review-badge.png'
import practiceBadge from './practice-badge.png'
import masteryBadge from './mastery-badge.png'
import backgroundAuroraGrid from './background-aurora-grid.png'
import backgroundNebulaPanels from './background-nebula-panels.png'
import backgroundGraphiteFlow from './background-graphite-flow.png'
import landscapeMountainDawn from './landscape-mountain-dawn.png'
import landscapeRainyCity from './landscape-rainy-city.png'
import landscapeForestTerminal from './landscape-forest-terminal.png'
import landscapeOceanNight from './landscape-ocean-night.png'
import animeNeonStudy from './anime-neon-study.png'
import animeCyberSakura from './anime-cyber-sakura.png'
import animeCodingAssistant from './anime-coding-assistant.png'
import workspaceFocusScene from './workspace-focus-scene.png'
import themeDeepSpace from './theme-deep-space.png'
import themeForestFocus from './theme-forest-focus.png'
import themeAnimeStudy from './theme-anime-study.png'

export type CodeHelperMaterialCategory =
  | 'hero'
  | 'card'
  | 'empty-state'
  | 'badge'
  | 'background'
  | 'wallpaper'

export interface CodeHelperMaterial {
  key: string
  title: string
  category: CodeHelperMaterialCategory
  width: number
  height: number
  src: string
}

export const codeHelperMaterials: CodeHelperMaterial[] = [
  {
    key: 'hero-workbench',
    title: 'Workbench',
    category: 'hero',
    width: 1600,
    height: 900,
    src: heroWorkbench,
  },
  {
    key: 'hero-ai-tutor',
    title: 'AI Tutor',
    category: 'hero',
    width: 1600,
    height: 900,
    src: heroAiTutor,
  },
  {
    key: 'hero-practice-lab',
    title: 'Practice Lab',
    category: 'hero',
    width: 1600,
    height: 900,
    src: heroPracticeLab,
  },
  {
    key: 'hero-learning-path',
    title: 'Learning Path',
    category: 'hero',
    width: 1600,
    height: 900,
    src: heroLearningPath,
  },
  {
    key: 'hero-knowledge-base',
    title: 'Knowledge Base',
    category: 'hero',
    width: 1600,
    height: 900,
    src: heroKnowledgeBase,
  },
  {
    key: 'card-code-review',
    title: 'Review',
    category: 'card',
    width: 960,
    height: 540,
    src: cardCodeReview,
  },
  {
    key: 'card-algorithm-map',
    title: 'Algorithm Map',
    category: 'card',
    width: 960,
    height: 540,
    src: cardAlgorithmMap,
  },
  {
    key: 'card-debug-console',
    title: 'Debug Console',
    category: 'card',
    width: 960,
    height: 540,
    src: cardDebugConsole,
  },
  {
    key: 'card-note-capture',
    title: 'Notes',
    category: 'card',
    width: 960,
    height: 540,
    src: cardNoteCapture,
  },
  {
    key: 'card-ai-agent',
    title: 'AI Agent',
    category: 'card',
    width: 960,
    height: 540,
    src: cardAiAgent,
  },
  {
    key: 'card-progress-chart',
    title: 'Progress',
    category: 'card',
    width: 960,
    height: 540,
    src: cardProgressChart,
  },
  {
    key: 'empty-no-activity',
    title: 'No Activity',
    category: 'empty-state',
    width: 960,
    height: 720,
    src: emptyNoActivity,
  },
  {
    key: 'empty-no-lessons',
    title: 'No Lessons',
    category: 'empty-state',
    width: 960,
    height: 720,
    src: emptyNoLessons,
  },
  {
    key: 'empty-no-practice',
    title: 'No Practice',
    category: 'empty-state',
    width: 960,
    height: 720,
    src: emptyNoPractice,
  },
  {
    key: 'empty-no-knowledge',
    title: 'No Knowledge',
    category: 'empty-state',
    width: 960,
    height: 720,
    src: emptyNoKnowledge,
  },
  {
    key: 'empty-no-search-results',
    title: 'No Results',
    category: 'empty-state',
    width: 960,
    height: 720,
    src: emptyNoSearchResults,
  },
  {
    key: 'empty-offline-mode',
    title: 'Offline',
    category: 'empty-state',
    width: 960,
    height: 720,
    src: emptyOfflineMode,
  },
  {
    key: 'streak-badge',
    title: 'Streak Badge',
    category: 'badge',
    width: 512,
    height: 512,
    src: streakBadge,
  },
  {
    key: 'focus-badge',
    title: 'Focus Badge',
    category: 'badge',
    width: 512,
    height: 512,
    src: focusBadge,
  },
  {
    key: 'review-badge',
    title: 'Review Badge',
    category: 'badge',
    width: 512,
    height: 512,
    src: reviewBadge,
  },
  {
    key: 'practice-badge',
    title: 'Practice Badge',
    category: 'badge',
    width: 512,
    height: 512,
    src: practiceBadge,
  },
  {
    key: 'mastery-badge',
    title: 'Mastery Badge',
    category: 'badge',
    width: 512,
    height: 512,
    src: masteryBadge,
  },
  {
    key: 'background-aurora-grid',
    title: 'Aurora Grid',
    category: 'background',
    width: 1920,
    height: 1080,
    src: backgroundAuroraGrid,
  },
  {
    key: 'background-nebula-panels',
    title: 'Nebula Panels',
    category: 'background',
    width: 1920,
    height: 1080,
    src: backgroundNebulaPanels,
  },
  {
    key: 'background-graphite-flow',
    title: 'Graphite Flow',
    category: 'background',
    width: 1920,
    height: 1080,
    src: backgroundGraphiteFlow,
  },
  {
    key: 'landscape-mountain-dawn',
    title: 'Mountain Dawn',
    category: 'wallpaper',
    width: 1920,
    height: 1080,
    src: landscapeMountainDawn,
  },
  {
    key: 'landscape-rainy-city',
    title: 'Rainy City',
    category: 'wallpaper',
    width: 1920,
    height: 1080,
    src: landscapeRainyCity,
  },
  {
    key: 'landscape-forest-terminal',
    title: 'Forest Terminal',
    category: 'wallpaper',
    width: 1920,
    height: 1080,
    src: landscapeForestTerminal,
  },
  {
    key: 'landscape-ocean-night',
    title: 'Ocean Night',
    category: 'wallpaper',
    width: 1920,
    height: 1080,
    src: landscapeOceanNight,
  },
  {
    key: 'anime-neon-study',
    title: 'Neon Study',
    category: 'wallpaper',
    width: 1920,
    height: 1080,
    src: animeNeonStudy,
  },
  {
    key: 'anime-cyber-sakura',
    title: 'Cyber Sakura',
    category: 'wallpaper',
    width: 1920,
    height: 1080,
    src: animeCyberSakura,
  },
  {
    key: 'anime-coding-assistant',
    title: 'Coding Assistant',
    category: 'wallpaper',
    width: 1920,
    height: 1080,
    src: animeCodingAssistant,
  },
  {
    key: 'workspace-focus-scene',
    title: 'Focus Scene',
    category: 'wallpaper',
    width: 1920,
    height: 1080,
    src: workspaceFocusScene,
  },
  {
    key: 'theme-deep-space',
    title: 'Deep Space',
    category: 'wallpaper',
    width: 1672,
    height: 941,
    src: themeDeepSpace,
  },
  {
    key: 'theme-forest-focus',
    title: 'Forest Focus',
    category: 'wallpaper',
    width: 1672,
    height: 941,
    src: themeForestFocus,
  },
  {
    key: 'theme-anime-study',
    title: 'Anime Study',
    category: 'wallpaper',
    width: 1672,
    height: 941,
    src: themeAnimeStudy,
  },
]

export const codeHelperMaterialByKey = Object.fromEntries(
  codeHelperMaterials.map((asset) => [asset.key, asset]),
) as Record<string, CodeHelperMaterial>
