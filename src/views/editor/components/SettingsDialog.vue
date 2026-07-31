<script setup vapor lang="ts">
import { ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import BaseDrawer from '@/components/BaseDrawer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { getSetting, setSetting } from '@/config/settings'
import {
  autoUpdateEnabled,
  autoUpdatePending,
  autoUpdateRid,
  checkForUpdates,
  downloadUpdateWithRid,
  type UpdateInfo,
} from '@/composables/useAutoUpdater'
import { autoSaveEnabled, autoSaveInterval } from '@/composables/useEditorSettings'
import {
  paraFontSize,
  paraLineHeight,
  paraFontWeight,
  paraMargin,
  paraIndent,
} from '@/composables/useParagraphSettings'
import { testConnection } from '@/services/githubUploader'
import { GitHubTreeService } from '@/services/GitHubTreeService'
import { useTheme } from '@/composables/useTheme'
import ImageCacheDialog from './ImageCacheDialog.vue'
import { testConnection as testLetaConnection } from '@/services/letaUploader'

const props = defineProps<{
  visible: boolean
  initialTab?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const ZOOM_PRESETS = [50, 75, 80, 90, 100, 110, 125, 150, 175, 200]
const SAVE_INTERVAL_PRESETS = [0.5, 1, 2, 3, 5, 8, 10]
const isTauri = import.meta.env.VITE_TAURI === 'true'
const { colors } = useTheme()

const selectChevronStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
}

// ── 设置 tab ──
const settingsTab = ref('basic')

// 当对话框打开时，若指定了 initialTab 则自动切换
watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible && props.initialTab) {
      settingsTab.value = props.initialTab
    }
  },
)
// 图床上传子 tab：upload | github | leta
const hostingTab = ref('upload')

// ── 图床配置 ──
const githubRepo = ref(getSetting<string>('githubRepo'))
const githubToken = ref(getSetting<string>('githubToken'))
const githubBranch = ref(getSetting<string>('githubBranch'))

const githubTesting = ref(false)
const githubTestResult = ref<'ok' | 'fail' | ''>('')
const githubTestError = ref('')

const letaToken = ref(getSetting<string>('letaToken'))
const letaStorageId = ref(getSetting<string>('letaStorageId'))

const letaTesting = ref(false)
const letaTestResult = ref<'ok' | 'fail' | ''>('')
const letaTestError = ref('')

function saveGitHubRepo(val: string) {
  githubRepo.value = val
  setSetting('githubRepo', val)
  githubTestResult.value = ''
  githubTestError.value = ''
}

function saveGitHubToken(val: string) {
  githubToken.value = val
  setSetting('githubToken', val)
  githubTestResult.value = ''
  githubTestError.value = ''
}

function saveGitHubBranch(val: string) {
  githubBranch.value = val
  setSetting('githubBranch', val)
  githubTestResult.value = ''
  githubTestError.value = ''
}

function saveLetuToken(val: string) {
  letaToken.value = val
  setSetting('letaToken', val)
  letaTestResult.value = ''
  letaTestError.value = ''
}

function saveLetuStorageId(val: string) {
  letaStorageId.value = val
  setSetting('letaStorageId', val)
  letaTestResult.value = ''
  letaTestError.value = ''
}

// ── 粘贴/拖拽上传方式 ──
const pasteDropMode = ref(getSetting<string>('pasteDropMode'))

function savePasteDropMode(val: string) {
  pasteDropMode.value = val
  setSetting('pasteDropMode', val)
}

// ── 默认图床（工具栏上传按钮使用）──
const defaultHosting = ref(getSetting<string>('defaultHosting'))

function saveDefaultHosting(val: string) {
  defaultHosting.value = val
  setSetting('defaultHosting', val)
}

// ── 压缩质量 ──
const compressQuality = ref(getSetting<number>('compressQuality'))

function saveCompressQuality(val: number) {
  compressQuality.value = val
  setSetting('compressQuality', val)
}

// ── Minimap 缩略图 ──
const minimapEnabled = ref(getSetting<boolean>('minimapEnabled'))
watch(minimapEnabled, (val) => setSetting('minimapEnabled', val))

// ── 编辑器主题 ──
const editorTheme = ref(getSetting<string>('editorTheme'))

function saveEditorTheme(theme: string) {
  editorTheme.value = theme
  setSetting('editorTheme', theme)
}

// ── 普通段落设置（使用共享 ref，变更时预览自动响应）──
function saveParaFontSize(val: number) {
  paraFontSize.value = val
}
function saveParaLineHeight(val: number) {
  paraLineHeight.value = val
}
function saveParaFontWeight(val: string) {
  paraFontWeight.value = val
}
function saveParaMargin(val: number) {
  paraMargin.value = val
}
function saveParaIndent(val: string) {
  paraIndent.value = val
}

function resetParaDefaults() {
  saveParaFontSize(16)
  saveParaLineHeight(1.85)
  saveParaFontWeight('400')
  saveParaMargin(24)
  saveParaIndent('')
}

async function handleTestConnection() {
  if (!githubRepo.value || !githubToken.value) return
  githubTesting.value = true
  githubTestResult.value = ''
  githubTestError.value = ''
  try {
    await testConnection({
      repo: githubRepo.value,
      token: githubToken.value,
      branch: githubBranch.value || 'main',
    })
    githubTestResult.value = 'ok'
  } catch (e: any) {
    githubTestResult.value = 'fail'
    githubTestError.value = e.message || '连接失败'
  }
  githubTesting.value = false
}

async function handleTestLetuConnection() {
  if (!letaToken.value) return
  letaTesting.value = true
  letaTestResult.value = ''
  letaTestError.value = ''
  try {
    await testLetaConnection({
      token: letaToken.value,
      storageId: letaStorageId.value || '1',
    })
    letaTestResult.value = 'ok'
  } catch (e: any) {
    letaTestResult.value = 'fail'
    letaTestError.value = e.message || '连接失败'
  }
  letaTesting.value = false
}

const currentZoom = ref(getSetting<number>('pageZoom'))

const updateChecking = ref(false)
const updateMessage = ref('')
const updateError = ref(false)

const updateDialogVisible = ref(false)
const updateDialogVersion = ref('')
const pendingUpdate = ref<UpdateInfo | null>(null)
const pendingRid = ref<number | null>(null)
const downloading = ref(false)
const downloadProgress = ref(0)

const showImageCache = ref(false)

// 图片缓存清理全局确认弹窗
const imgCleanupVisible = ref(false)
const imgCleanupMessage = ref('')
const imgCleanupTokens = ref<string[]>([])
const imgCacheRef = ref<InstanceType<typeof ImageCacheDialog> | null>(null)

function onImgRequestCleanup(payload: { message: string; tokens: string[] }) {
  imgCleanupMessage.value = payload.message
  imgCleanupTokens.value = payload.tokens
  imgCleanupVisible.value = true
}

async function onImgCleanupConfirm() {
  imgCleanupVisible.value = false
  if (imgCacheRef.value) {
    await imgCacheRef.value.doCleanup(imgCleanupTokens.value)
  }
  imgCleanupTokens.value = []
}

// ── 公众号配置 ──
const wechatAppId = ref(getSetting<string>('wechatAppId'))
const wechatAppSecret = ref(getSetting<string>('wechatAppSecret'))
const wechatDefaultAuthor = ref(getSetting<string>('wechatDefaultAuthor'))

function saveWechatAppId(val: string) {
  wechatAppId.value = val
  setSetting('wechatAppId', val)
}
function saveWechatAppSecret(val: string) {
  wechatAppSecret.value = val
  setSetting('wechatAppSecret', val)
}
function saveWechatDefaultAuthor(val: string) {
  wechatDefaultAuthor.value = val
  setSetting('wechatDefaultAuthor', val)
}

// ── 云端文章 GitHub 配置 ──
const cloudToken = ref(GitHubTreeService.getToken() || '')
const _repoInit = GitHubTreeService.getRepo()
const cloudRepo = ref(_repoInit ? `${_repoInit.owner}/${_repoInit.repo}` : '')

const cloudTesting = ref(false)
const cloudTestResult = ref<'ok' | 'fail' | ''>('')
const cloudTestError = ref('')

function saveCloudToken(val: string) {
  cloudToken.value = val
  cloudTestResult.value = ''
  if (!val) {
    GitHubTreeService.clearToken()
    return
  }
  const repo = cloudRepo.value.trim()
  if (repo) {
    const slashIdx = repo.indexOf('/')
    if (slashIdx > 0) {
      const owner = repo.substring(0, slashIdx)
      const repoName = repo.substring(slashIdx + 1)
      GitHubTreeService.setConfig(owner, repoName, val)
    }
  }
}

function saveCloudRepo(val: string) {
  cloudRepo.value = val
  cloudTestResult.value = ''
  if (!val) {
    GitHubTreeService.clearRepo()
    return
  }
  const token = cloudToken.value.trim()
  if (token) {
    const slashIdx = val.indexOf('/')
    if (slashIdx > 0) {
      const owner = val.substring(0, slashIdx)
      const repoName = val.substring(slashIdx + 1)
      GitHubTreeService.setConfig(owner, repoName, token)
    }
  }
}

async function handleCloudTestConnection() {
  const repo = cloudRepo.value.trim()
  const token = cloudToken.value.trim()
  if (!repo || !token) return

  const slashIdx = repo.indexOf('/')
  if (slashIdx <= 0) {
    cloudTestResult.value = 'fail'
    cloudTestError.value = '仓库格式错误，应为 owner/repo'
    return
  }
  const owner = repo.substring(0, slashIdx)
  const repoName = repo.substring(slashIdx + 1)

  cloudTesting.value = true
  cloudTestResult.value = ''
  cloudTestError.value = ''
  try {
    await GitHubTreeService.testConnection(owner, repoName, token)
    cloudTestResult.value = 'ok'
  } catch (e: any) {
    cloudTestResult.value = 'fail'
    cloudTestError.value = e.message || '连接失败'
  }
  cloudTesting.value = false
}

async function applyZoom(scale: number) {
  currentZoom.value = scale
  setSetting('pageZoom', scale)
  try {
    await invoke('set_page_zoom', { scale: scale / 100 })
  } catch {
    // 非 Tauri 环境忽略
  }
}

async function manualCheckUpdate() {
  updateChecking.value = true
  updateMessage.value = ''
  updateError.value = false

  // 复用 EditorPage 自动检查的结果（同一个 rid），避免创建重复 Update 资源
  if (autoUpdatePending.value && autoUpdateRid.value != null) {
    pendingUpdate.value = autoUpdatePending.value
    pendingRid.value = autoUpdateRid.value
    updateDialogVersion.value = autoUpdatePending.value.version
    updateDialogVisible.value = true
    updateChecking.value = false
    return
  }

  const result = await checkForUpdates()

  if (result.error) {
    updateMessage.value = result.error
    updateError.value = true
  } else if (result.update) {
    pendingUpdate.value = result.update
    pendingRid.value = result.rid
    updateDialogVersion.value = result.update.version
    updateDialogVisible.value = true
  } else {
    updateMessage.value = '已是最新版本'
    updateError.value = false
  }

  updateChecking.value = false
}

async function doDownloadUpdate() {
  updateDialogVisible.value = false
  if (!pendingUpdate.value || pendingRid.value == null) return

  downloading.value = true
  downloadProgress.value = 0

  try {
    let total = 0
    let totalSize = 0
    await downloadUpdateWithRid(pendingRid.value, (event) => {
      if (event.event === 'Started') {
        totalSize = event.data?.contentLength ?? 0
      } else if (event.event === 'Progress') {
        total += event.data?.chunkLength ?? 0
        if (totalSize > 0) {
          downloadProgress.value = Math.round((total / totalSize) * 100)
        }
      }
    })
    // downloadAndInstall 成功后自动重启；dev 模式下重启不生效，提示手动重启
    updateMessage.value = '更新已下载，请重启应用以完成安装'
    updateError.value = false
    downloading.value = false
  } catch (e) {
    console.error('[updater] download error:', e, typeof e, JSON.stringify(e))
    updateMessage.value = `安装失败: ${e}`
    updateError.value = true
    downloading.value = false
  }
}
</script>

<template>
  <BaseDrawer
    :visible="visible"
    title="设置"
    width="min(90vw, 680px)"
    :show-footer="false"
    @close="emit('close')"
  >
    <template #header>
      <div class="flex gap-1">
        <button
          class="cursor-pointer whitespace-nowrap rounded-full border-0 px-3 py-[5px] text-xs transition-colors"
          :class="
            settingsTab === 'basic'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-transparent text-[#999] hover:text-[#333] dark:hover:text-[#ccc]'
          "
          @click="settingsTab = 'basic'"
        >
          基础设置
        </button>
        <button
          class="cursor-pointer whitespace-nowrap rounded-full border-0 px-3 py-[5px] text-xs transition-colors"
          :class="
            settingsTab === 'github'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-transparent text-[#999] hover:text-[#333] dark:hover:text-[#ccc]'
          "
          @click="settingsTab = 'github'"
        >
          图片设置
        </button>
        <button
          class="cursor-pointer whitespace-nowrap rounded-full border-0 px-3 py-[5px] text-xs transition-colors"
          :class="
            settingsTab === 'cloud'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-transparent text-[#999] hover:text-[#333] dark:hover:text-[#ccc]'
          "
          @click="settingsTab = 'cloud'"
        >
          文章仓库
        </button>
        <button
          v-if="isTauri"
          class="cursor-pointer whitespace-nowrap rounded-full border-0 px-3 py-[5px] text-xs transition-colors"
          :class="
            settingsTab === 'wechat'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-transparent text-[#999] hover:text-[#333] dark:hover:text-[#ccc]'
          "
          @click="settingsTab = 'wechat'"
        >
          公众号
        </button>
        <button
          v-if="isTauri"
          class="cursor-pointer whitespace-nowrap rounded-full border-0 px-3 py-[5px] text-xs transition-colors"
          :class="
            settingsTab === 'other'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-transparent text-[#999] hover:text-[#333] dark:hover:text-[#ccc]'
          "
          @click="settingsTab = 'other'"
        >
          其他设置
        </button>
      </div>
    </template>

    <!-- 基础设置 -->
    <template v-if="settingsTab === 'basic'">
      <!-- 普通段落 -->
      <section class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5]">普通段落</h3>
          <button
            class="cursor-pointer rounded-full border border-[#e5e5e5] bg-white px-3 py-[4px] text-[11px] text-[#999] transition-colors hover:border-[#ccc] hover:text-[#666] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666] dark:hover:text-[#ccc]"
            @click="resetParaDefaults"
          >
            恢复默认
          </button>
        </div>

        <!-- 字体大小 -->
        <div class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <label class="text-[12px] text-[#666] dark:text-[#999]">字体大小</label>
            <span class="text-[12px] font-medium tabular-nums text-[var(--accent)]"
              >{{ paraFontSize }}px</span
            >
          </div>
          <input
            type="range"
            min="12"
            max="24"
            step="1"
            :value="paraFontSize"
            class="compress-slider w-full cursor-pointer"
            @input="saveParaFontSize(Number(($event.target as HTMLInputElement).value))"
          />
          <div class="flex justify-between text-[10px] text-[#999] dark:text-[#666] mt-0.5">
            <span>12px</span>
            <span>24px</span>
          </div>
        </div>

        <!-- 行高 -->
        <div class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <label class="text-[12px] text-[#666] dark:text-[#999]">行高</label>
            <span class="text-[12px] font-medium tabular-nums text-[var(--accent)]">{{
              paraLineHeight
            }}</span>
          </div>
          <input
            type="range"
            min="1.2"
            max="3.0"
            step="0.05"
            :value="paraLineHeight"
            class="compress-slider w-full cursor-pointer"
            @input="saveParaLineHeight(Number(($event.target as HTMLInputElement).value))"
          />
          <div class="flex justify-between text-[10px] text-[#999] dark:text-[#666] mt-0.5">
            <span>1.2</span>
            <span>3.0</span>
          </div>
        </div>

        <!-- 字重 -->
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">字重</label>
          <select
            :value="paraFontWeight"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none box-border cursor-pointer appearance-none bg-no-repeat bg-[right_8px_center] pr-7 transition-colors focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(108,92,231,0.1)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5]"
            :style="selectChevronStyle"
            @change="saveParaFontWeight(($event.target as HTMLSelectElement).value)"
          >
            <option value="300">300（更细）</option>
            <option value="400">400（常规）</option>
            <option value="500">500（中等）</option>
            <option value="600">600（半粗）</option>
            <option value="700">700（粗体）</option>
          </select>
        </div>

        <!-- 间距 -->
        <div class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <label class="text-[12px] text-[#666] dark:text-[#999]">段落间距</label>
            <span class="text-[12px] font-medium tabular-nums text-[var(--accent)]"
              >{{ paraMargin }}px</span
            >
          </div>
          <input
            type="range"
            min="8"
            max="48"
            step="1"
            :value="paraMargin"
            class="compress-slider w-full cursor-pointer"
            @input="saveParaMargin(Number(($event.target as HTMLInputElement).value))"
          />
          <div class="flex justify-between text-[10px] text-[#999] dark:text-[#666] mt-0.5">
            <span>8px</span>
            <span>48px</span>
          </div>
        </div>

        <!-- 首行缩进 -->
        <div class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <label class="text-[12px] text-[#666] dark:text-[#999]">首行缩进</label>
            <span
              v-if="paraIndent"
              class="text-[12px] font-medium tabular-nums text-[var(--accent)]"
              >{{ paraIndent }}</span
            >
          </div>
          <input
            type="text"
            :value="paraIndent"
            placeholder="如 2em（不填则不缩进）"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#bbb] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#666]"
            @input="saveParaIndent(($event.target as HTMLInputElement).value)"
          />
        </div>
      </section>

      <!-- 自动保存（仅桌面端） -->
      <section v-if="isTauri">
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">自动保存</h3>
        <div class="flex items-center justify-between mb-3">
          <span class="text-[12px] text-[#666] dark:text-[#999]">启用自动保存</span>
          <button
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
            :class="autoSaveEnabled ? 'bg-[var(--accent)]' : 'bg-[#ccc] dark:bg-[#555]'"
            @click="autoSaveEnabled = !autoSaveEnabled"
            role="switch"
            :aria-checked="autoSaveEnabled"
          >
            <span
              class="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
              :class="autoSaveEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'"
            />
          </button>
        </div>
        <p
          v-if="!autoSaveEnabled"
          class="text-[12px] text-[var(--accent)] bg-[var(--accent-light)] rounded-lg px-3 py-2 mb-3"
        >
          自动保存已关闭，请及时手动保存（工具栏「暂存」按钮）
        </p>
        <div>
          <span
            class="text-[12px] text-[#666] dark:text-[#999] mb-2 block"
            :class="{ 'opacity-40': !autoSaveEnabled }"
            >保存间隔</span
          >
          <div class="flex flex-nowrap gap-2">
            <button
              v-for="s in SAVE_INTERVAL_PRESETS"
              :key="s"
              :disabled="!autoSaveEnabled"
              class="cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all duration-150 shrink-0 disabled:cursor-not-allowed disabled:opacity-30"
              :class="
                autoSaveInterval === s
                  ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]'
                  : 'border-[#e5e5e5] bg-white text-[#666] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666]'
              "
              @click="autoSaveInterval = s"
            >
              {{ s }}s
            </button>
          </div>
          <p class="text-[11px] text-[#999] dark:text-[#666] mt-2.5">
            当前间隔：{{ autoSaveInterval }}s（停止输入后触发保存）
          </p>
        </div>
      </section>

      <!-- Minimap 缩略图 -->
      <section class="mt-4 pt-4 border-t border-[#f0f0f0] dark:border-[#333]">
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">
          预览缩略图
        </h3>
        <div class="flex items-center justify-between mb-2">
          <span class="text-[12px] text-[#666] dark:text-[#999]"
            >在预览区右侧显示文档全貌缩略图</span
          >
          <button
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
            :class="minimapEnabled ? 'bg-[var(--accent)]' : 'bg-[#ccc] dark:bg-[#555]'"
            @click="minimapEnabled = !minimapEnabled"
            role="switch"
            :aria-checked="minimapEnabled"
          >
            <span
              class="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
              :class="minimapEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'"
            />
          </button>
        </div>
        <p class="text-[11px] text-[#999] dark:text-[#666]">
          开启后可在预览区右侧看到文档全貌缩略图，点击可快速跳转
        </p>
      </section>

      <!-- 编辑器主题 -->
      <section class="mt-4 pt-4 border-t border-[#f0f0f0] dark:border-[#333]">
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">
          编辑器主题
        </h3>
        <select
          :value="editorTheme"
          class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none box-border cursor-pointer appearance-none bg-no-repeat bg-[right_8px_center] pr-7 transition-colors focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(108,92,231,0.1)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5]"
          :style="selectChevronStyle"
          @change="saveEditorTheme(($event.target as HTMLSelectElement).value)"
        >
          <optgroup label="浅色主题">
            <option value="default">默认</option>
            <option value="github-light">GitHub Light</option>
            <option value="solarized-light">Solarized Light</option>
            <option value="material-light">Material Light</option>
          </optgroup>
          <optgroup label="深色主题">
            <option value="one-dark">One Dark</option>
            <option value="github-dark">GitHub Dark</option>
            <option value="solarized-dark">Solarized Dark</option>
            <option value="material-dark">Material Dark</option>
            <option value="dracula">Dracula</option>
            <option value="monokai">Monokai</option>
          </optgroup>
        </select>
        <p class="text-[11px] text-[#999] dark:text-[#666] mt-2">
          仅切换语法高亮色，编辑器背景不受主题切换影响。切换后立即生效，设置自动保存。
        </p>
      </section>
    </template>

    <!-- 图床设置 -->
    <template v-if="settingsTab === 'github'">
      <!-- 图床子 tab -->
      <div class="flex gap-1.5 mb-4">
        <button
          class="cursor-pointer whitespace-nowrap rounded-full border px-3 py-[5px] text-xs transition-colors"
          :class="
            hostingTab === 'upload'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
              : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
          "
          @click="hostingTab = 'upload'"
        >
          上传设置
        </button>
        <button
          class="cursor-pointer whitespace-nowrap rounded-full border px-3 py-[5px] text-xs transition-colors"
          :class="
            hostingTab === 'github'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
              : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
          "
          @click="hostingTab = 'github'"
        >
          GitHub 图床
        </button>
        <button
          class="cursor-pointer whitespace-nowrap rounded-full border px-3 py-[5px] text-xs transition-colors"
          :class="
            hostingTab === 'leta'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
              : 'border-[#e5e5e5] bg-white text-[#999] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:hover:border-[#666]'
          "
          @click="hostingTab = 'leta'"
        >
          乐塔图床
        </button>
      </div>

      <section v-if="hostingTab === 'upload'">
        <!-- 上传方式 -->
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">
          {{ isTauri ? '粘贴上传方式' : '粘贴/拖拽上传方式' }}
        </h3>
        <div class="flex gap-2">
          <label
            class="cursor-pointer rounded-lg border px-4 py-2 text-center text-[12px] transition-colors min-w-[110px]"
            :class="
              pasteDropMode === 'local'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[#e5e5e5] bg-white text-[#666] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]'
            "
          >
            <input
              type="radio"
              class="sr-only"
              value="local"
              :checked="pasteDropMode === 'local'"
              @change="savePasteDropMode('local')"
            />
            本地存储
          </label>
          <label
            class="cursor-pointer rounded-lg border px-4 py-2 text-center text-[12px] transition-colors min-w-[110px]"
            :class="
              pasteDropMode === 'github'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[#e5e5e5] bg-white text-[#666] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]'
            "
          >
            <input
              type="radio"
              class="sr-only"
              value="github"
              :checked="pasteDropMode === 'github'"
              @change="savePasteDropMode('github')"
            />
            GitHub 图床
          </label>
          <label
            class="cursor-pointer rounded-lg border px-4 py-2 text-center text-[12px] transition-colors min-w-[110px]"
            :class="
              pasteDropMode === 'leta'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[#e5e5e5] bg-white text-[#666] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]'
            "
          >
            <input
              type="radio"
              class="sr-only"
              value="leta"
              :checked="pasteDropMode === 'leta'"
              @change="savePasteDropMode('leta')"
            />
            乐塔图床
          </label>
        </div>
        <p class="text-[10px] text-[#999] dark:text-[#666] mt-1.5">
          本地存储：图片以 base64 编码嵌入文档（压缩后单张 ≤ 5M），建议开启压缩以减少文档体积<br />
          GitHub 图床：上传至仓库后使用 CDN 链接（压缩后单张 ≤ 5MB）<br />
          乐塔图床：通过乐塔 API 上传，返回直链地址（压缩后单张 ≤ 10MB）
        </p>

        <!-- 默认图床（工具栏上传按钮使用） -->
        <div class="mt-4">
          <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">
            默认图床
          </h3>
          <p class="text-[11px] text-[#999] dark:text-[#666] mb-3">
            点击工具栏「图床」按钮上传时使用的图床服务，独立于粘贴/拖拽方式。
          </p>
          <div class="flex gap-2">
            <label
              class="cursor-pointer rounded-lg border px-4 py-2 text-center text-[12px] transition-colors min-w-[110px]"
              :class="
                defaultHosting === 'github'
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[#e5e5e5] bg-white text-[#666] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]'
              "
            >
              <input
                type="radio"
                class="sr-only"
                value="github"
                :checked="defaultHosting === 'github'"
                @change="saveDefaultHosting('github')"
              />
              GitHub 图床
            </label>
            <label
              class="cursor-pointer rounded-lg border px-4 py-2 text-center text-[12px] transition-colors min-w-[110px]"
              :class="
                defaultHosting === 'leta'
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[#e5e5e5] bg-white text-[#666] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999]'
              "
            >
              <input
                type="radio"
                class="sr-only"
                value="leta"
                :checked="defaultHosting === 'leta'"
                @change="saveDefaultHosting('leta')"
              />
              乐塔图床
            </label>
          </div>
        </div>

        <!-- 压缩质量 -->
        <div class="mt-4">
          <div class="flex items-center justify-between mb-1">
            <label class="text-[12px] text-[#666] dark:text-[#999]">压缩质量</label>
            <span class="text-[12px] font-medium tabular-nums text-[var(--accent)]"
              >{{ compressQuality }}%</span
            >
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            :value="compressQuality"
            class="compress-slider w-full cursor-pointer"
            @input="saveCompressQuality(Number(($event.target as HTMLInputElement).value))"
          />
          <div class="flex justify-between text-[10px] text-[#999] dark:text-[#666] mt-0.5">
            <span>低（小体积）</span>
            <span>高（高画质）</span>
          </div>
          <p class="text-[10px] text-[#999] dark:text-[#666] mt-1.5">
            对应 JPEG
            压缩质量，值越高图片越清晰，体积越大。压缩比100%时，不会对图片做任何处理。压缩后图片将统一转为
            JPEG 格式。
          </p>
        </div>

        <!-- 清理图片缓存 -->
        <div class="mt-4 pt-3 border-t border-[#eee] dark:border-[#444]">
          <button
            class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] font-medium text-[#666] transition-colors hover:border-[#ccc] hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666] dark:hover:bg-[#333]"
            @click="showImageCache = true"
          >
            清理图片缓存
          </button>
          <p class="text-[10px] text-[#999] dark:text-[#666] mt-1.5">
            查看并清理编辑器本地存储的图片缓存，释放磁盘空间。
          </p>
        </div>
      </section>

      <section v-if="hostingTab === 'github'">
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">
          GitHub 图床
        </h3>
        <p class="text-[11px] text-[#999] dark:text-[#666] mb-3">
          图片通过 GitHub API 上传后，使用 jsDelivr CDN 返回链接。 需要公共仓库 + Personal Access
          Token（repo 权限）。
        </p>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">仓库</label>
          <input
            :value="githubRepo"
            placeholder="用户名/仓库名"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveGitHubRepo(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block"
            >Personal Access Token</label
          >
          <input
            :value="githubToken"
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveGitHubToken(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">分支</label>
          <input
            :value="githubBranch"
            placeholder="main"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveGitHubBranch(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex items-center gap-3">
          <button
            class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] font-medium text-[#666] transition-colors hover:border-[#ccc] hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666] dark:hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!githubRepo || !githubToken || githubTesting"
            @click="handleTestConnection"
          >
            {{ githubTesting ? '测试中…' : '测试连接' }}
          </button>
          <span
            v-if="githubTestResult === 'ok'"
            class="text-[12px]"
            :style="{ color: colors.accent }"
            >连接成功</span
          >
          <span v-if="githubTestResult === 'fail'" class="text-[12px] text-[#e74c3c]"
            >连接失败</span
          >
        </div>
      </section>

      <section v-if="hostingTab === 'leta'">
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">乐塔图床</h3>
        <p class="text-[11px] text-[#999] dark:text-[#666] mb-3">
          通过乐塔图床 API 上传图片，返回直链地址。
        </p>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">Token</label>
          <input
            :value="letaToken"
            type="password"
            placeholder="Token"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveLetuToken(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">存储 ID</label>
          <input
            :value="letaStorageId"
            placeholder="1"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveLetuStorageId(($event.target as HTMLInputElement).value)"
          />
        </div>
        <p class="text-[11px] text-[#999] dark:text-[#666] mb-3">
          登录乐塔图床，按F12打开控制台，切换到Network标签，上传一张图片，点击upload接口，点击Payload，找到storage_id的值。
        </p>
        <div class="flex items-center gap-3">
          <button
            class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] font-medium text-[#666] transition-colors hover:border-[#ccc] hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666] dark:hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!letaToken || letaTesting"
            @click="handleTestLetuConnection"
          >
            {{ letaTesting ? '测试中…' : '测试连接' }}
          </button>
          <span v-if="letaTestResult === 'ok'" class="text-[12px]" :style="{ color: colors.accent }"
            >连接成功</span
          >
          <span v-if="letaTestResult === 'fail'" class="text-[12px] text-[#e74c3c]">连接失败</span>
        </div>
      </section>
    </template>

    <!-- 公众号设置（仅桌面端） -->
    <template v-if="settingsTab === 'wechat'">
      <section>
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">
          微信公众号配置
        </h3>
        <p class="text-[11px] text-[#999] dark:text-[#666] mb-3">
          用于将文章直接发布到微信公众号草稿箱。需要公众号的开发者 ID 和密钥。
        </p>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">AppID</label>
          <input
            :value="wechatAppId"
            placeholder="wx0000000000000000"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveWechatAppId(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">AppSecret</label>
          <input
            :value="wechatAppSecret"
            type="password"
            placeholder="请输入 AppSecret"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveWechatAppSecret(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">默认作者名</label>
          <input
            :value="wechatDefaultAuthor"
            placeholder="用于草稿 author 字段的默认值"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveWechatDefaultAuthor(($event.target as HTMLInputElement).value)"
          />
        </div>
      </section>
    </template>

    <!-- 文章仓库 -->
    <template v-if="settingsTab === 'cloud'">
      <section>
        <p class="text-[12px] text-[#666] dark:text-[#999] mb-4">
          GitHub 私有仓库（文章仓库存储）。仅需 <code class="text-[var(--accent)]">repo</code> scope
          的 Personal Access Token。
        </p>
        <div class="mb-3">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">仓库</label>
          <input
            :value="cloudRepo"
            placeholder="用户名/仓库名"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveCloudRepo(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="mb-4">
          <label class="text-[12px] text-[#666] dark:text-[#999] mb-1.5 block">Token</label>
          <input
            :value="cloudToken"
            type="password"
            placeholder="ghp_xxxxxxxxxxxx"
            class="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#ccc] focus:border-[var(--accent)] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#e5e5e5] dark:placeholder:text-[#555]"
            @input="saveCloudToken(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <button
            class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] font-medium text-[#666] transition-colors hover:border-[#ccc] hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666] dark:hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="cloudTesting"
            @click="handleCloudTestConnection"
          >
            {{ cloudTesting ? '测试中…' : '测试连接' }}
          </button>
          <span
            v-if="cloudTestResult === 'ok'"
            class="text-[12px]"
            style="color: var(--accent-green, #27ae60)"
          >
            连接成功
          </span>
          <span v-if="cloudTestResult === 'fail'" class="text-[12px]" style="color: #e74c3c">
            {{ cloudTestError || '连接失败' }}
          </span>
        </div>
      </section>
    </template>

    <!-- 其他设置（仅桌面端） -->
    <template v-if="settingsTab === 'other'">
      <!-- 页面缩放 -->
      <section>
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">页面缩放</h3>
        <div class="flex flex-nowrap gap-2">
          <button
            v-for="p in ZOOM_PRESETS"
            :key="p"
            class="cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all duration-150 shrink-0"
            :class="
              currentZoom === p
                ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]'
                : 'border-[#e5e5e5] bg-white text-[#666] hover:border-[#ccc] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666]'
            "
            @click="applyZoom(p)"
          >
            {{ p }}%
          </button>
        </div>
        <p class="text-[11px] text-[#999] dark:text-[#666] mt-2.5">
          当前缩放：{{ currentZoom }}%（设置会自动保存）
        </p>
      </section>

      <!-- 版本更新 -->
      <section class="mt-6 pt-6 border-t border-[#f0f0f0] dark:border-[#333]">
        <h3 class="text-[13px] font-semibold text-[#1a1a1a] dark:text-[#e5e5e5] mb-3">版本更新</h3>
        <div class="flex items-center justify-between mb-3">
          <span class="text-[12px] text-[#666] dark:text-[#999]">启动时自动检查更新</span>
          <button
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
            :class="autoUpdateEnabled ? 'bg-[var(--accent)]' : 'bg-[#ccc] dark:bg-[#555]'"
            @click="autoUpdateEnabled = !autoUpdateEnabled"
            role="switch"
            :aria-checked="autoUpdateEnabled"
          >
            <span
              class="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
              :class="autoUpdateEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'"
            />
          </button>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <button
            class="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-4 py-1.5 text-[12px] font-medium text-[#666] transition-colors hover:border-[#ccc] hover:bg-[#f5f5f5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#999] dark:hover:border-[#666] dark:hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="updateChecking || downloading"
            @click="manualCheckUpdate"
          >
            {{ updateChecking ? '检查中…' : downloading ? '下载中…' : '检查更新' }}
          </button>
          <span
            v-if="updateMessage"
            class="text-[12px]"
            :class="updateError ? 'text-[#e74c3c]' : 'text-[var(--accent-green)]'"
          >
            {{ updateMessage }}
          </span>
        </div>
        <!-- 下载进度 -->
        <div v-if="downloading" class="mt-3">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-[12px] text-[#666] dark:text-[#999]">正在下载更新...</span>
            <span class="text-[12px] font-medium text-[var(--accent)]"
              >{{ downloadProgress }}%</span
            >
          </div>
          <div class="h-1.5 w-full rounded-full bg-[#eee] dark:bg-[#444] overflow-hidden">
            <div
              class="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
              :style="{ width: downloadProgress + '%' }"
            />
          </div>
        </div>
      </section>
    </template>

    <!-- 更新确认弹窗 -->
    <ConfirmDialog
      v-model:visible="updateDialogVisible"
      title="发现新版本"
      :message="`版本 ${updateDialogVersion} 可用，是否立即下载安装？`"
      confirm-text="立即更新"
      @confirm="doDownloadUpdate"
      @cancel="updateDialogVisible = false"
    />

    <ImageCacheDialog
      ref="imgCacheRef"
      :visible="showImageCache"
      @close="showImageCache = false"
      @request-cleanup="onImgRequestCleanup"
    />
  </BaseDrawer>

  <!-- 清理图片缓存全局确认弹窗 -->
  <ConfirmDialog
    v-model:visible="imgCleanupVisible"
    title="清理图片缓存"
    :message="imgCleanupMessage"
    confirm-text="确定"
    @confirm="onImgCleanupConfirm"
    @cancel="imgCleanupVisible = false"
  />
</template>

<style scoped>
.compress-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: #e5e5e5;
  border-radius: 2px;
  outline: none;
  accent-color: var(--accent);
}

:global(.dark) .compress-slider {
  background: #444;
}

.compress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: none;
}

.compress-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: none;
}

.compress-slider::-moz-range-track {
  height: 4px;
  background: #e5e5e5;
  border-radius: 2px;
}
</style>
