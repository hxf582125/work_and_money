type MessageRole = 'assistant' | 'user'
type MessageStatus = 'idle' | 'loading' | 'error'

interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  status: MessageStatus
  voiceDuration?: string
  hasTranscript: boolean
  transcriptText: string
  confirmed: boolean
}

interface TranscriptResult {
  text: string
}

let recorderManager: any = null
let messageId = 0

function createMessage(role: MessageRole, content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  messageId += 1

  return {
    id: `message-${Date.now()}-${messageId}`,
    role,
    content,
    status: 'idle',
    hasTranscript: false,
    transcriptText: '',
    confirmed: false,
    ...extra,
  }
}

function formatDuration(duration = 0): string {
  const seconds = Math.max(1, Math.round(duration / 1000))
  return `${seconds}s`
}

async function transcribeVoiceFile(filePath: string): Promise<TranscriptResult> {
  // TODO: Replace this placeholder with wx.uploadFile after the backend API is ready.
  // Example shape:
  // wx.uploadFile({ url, filePath, name: 'voice', formData, success })
  if (!filePath) {
    throw new Error('missing voice file')
  }

  return {
    text: '',
  }
}

Component({
  data: {
    messages: [
      createMessage('assistant', '说一下今天做了什么，我会整理成工时。'),
    ] as ChatMessage[],
    inputValue: '',
    isRecording: false,
    isProcessing: false,
    isVoiceMode: false,
    isInputFocused: false,
    recordingText: '',
    scrollIntoView: '',
  },

  lifetimes: {
    attached() {
      this.initRecorderManager()
    },
  },

  methods: {
    initRecorderManager() {
      if (recorderManager) {
        return
      }

      recorderManager = wx.getRecorderManager()

      recorderManager.onStart(() => {
        this.setData({
          isRecording: true,
          recordingText: '正在录音',
        })
      })

      recorderManager.onStop((res: { tempFilePath: string, duration: number }) => {
        this.setData({
          isRecording: false,
          recordingText: '',
        })

        if (!res.tempFilePath) {
          wx.showToast({
            title: '录音文件无效',
            icon: 'none',
          })
          return
        }

        this.sendVoiceFile(res.tempFilePath, res.duration)
      })

      recorderManager.onError(() => {
        this.setData({
          isRecording: false,
          recordingText: '',
          isProcessing: false,
        })
        wx.showToast({
          title: '录音失败',
          icon: 'none',
        })
      })
    },

    onInput(e: WechatMiniprogram.Input) {
      this.setData({
        inputValue: e.detail.value,
      })
    },

    onSendTap() {
      const text = this.data.inputValue.trim()

      if (!text || this.data.isProcessing) {
        return
      }

      this.setData({
        inputValue: '',
      })
      this.addTranscriptMessage(text)
    },

    focusComposerInput() {
      if (this.data.isProcessing) {
        return
      }

      this.setData({
        isInputFocused: true,
      })
    },

    onComposerFocus() {
      this.setData({
        isInputFocused: true,
      })
    },

    onComposerBlur() {
      this.setData({
        isInputFocused: false,
      })
    },

    switchToVoice() {
      if (this.data.isProcessing) {
        return
      }

      this.setData({
        isVoiceMode: true,
        isInputFocused: false,
      })
      wx.hideKeyboard()
    },

    switchToText() {
      if (this.data.isProcessing) {
        return
      }

      this.setData({
        isVoiceMode: false,
      })

      wx.nextTick(() => {
        this.setData({
          isInputFocused: true,
        })
      })
    },

    onVoiceTouchStart() {
      if (this.data.isProcessing || this.data.isRecording) {
        return
      }

      this.initRecorderManager()
      this.ensureRecordPermission(() => {
        this.startRecording()
      })
    },

    onVoiceTouchEnd() {
      if (!this.data.isRecording || !recorderManager) {
        return
      }

      recorderManager.stop()
    },

    onVoiceTouchCancel() {
      this.onVoiceTouchEnd()
    },

    ensureRecordPermission(callback: () => void) {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.record']) {
            callback()
            return
          }

          wx.authorize({
            scope: 'scope.record',
            success: callback,
            fail: () => {
              wx.showModal({
                title: '需要麦克风权限',
                content: '打开麦克风权限后可以录入语音。',
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting()
                  }
                },
              })
            },
          })
        },
      })
    },

    startRecording() {
      if (!recorderManager) {
        return
      }

      this.setData({
        isRecording: true,
        recordingText: '正在录音',
      })

      recorderManager.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3',
      })
    },

    async sendVoiceFile(filePath: string, duration: number) {
      const userMessage = createMessage('user', '语音', {
        voiceDuration: formatDuration(duration),
      })
      const loadingMessage = createMessage('assistant', '转写中...', {
        status: 'loading',
      })

      this.setData({
        messages: [...this.data.messages, userMessage, loadingMessage],
        isProcessing: true,
        scrollIntoView: loadingMessage.id,
      })

      try {
        const result = await transcribeVoiceFile(filePath)
        this.updateMessage(loadingMessage.id, {
          content: '请确认转写文字',
          status: 'idle',
          hasTranscript: true,
          transcriptText: result.text,
        })
      } catch {
        this.updateMessage(loadingMessage.id, {
          content: '语音转写失败，请稍后再试',
          status: 'error',
        })
      } finally {
        this.setData({
          isProcessing: false,
        })
      }
    },

    addTranscriptMessage(text: string) {
      const userMessage = createMessage('user', text)
      const transcriptMessage = createMessage('assistant', '请确认转写文字', {
        hasTranscript: true,
        transcriptText: text,
      })

      this.setData({
        messages: [...this.data.messages, userMessage, transcriptMessage],
        scrollIntoView: transcriptMessage.id,
      })
    },

    onTranscriptInput(e: WechatMiniprogram.Input) {
      const id = e.currentTarget.dataset.id as string | undefined

      if (!id) {
        return
      }

      this.updateMessage(id, {
        transcriptText: e.detail.value,
      })
    },

    onConfirmTranscript(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      const message = this.data.messages.find((item) => item.id === id)
      const text = message?.transcriptText.trim()

      if (!id || !text) {
        wx.showToast({
          title: '请先确认文字',
          icon: 'none',
        })
        return
      }

      this.updateMessage(id, {
        content: '已确认转写文字',
        transcriptText: text,
        confirmed: true,
      })
    },

    updateMessage(id: string, patch: Partial<ChatMessage>) {
      const messages = this.data.messages.map((message) => {
        if (message.id !== id) {
          return message
        }

        return {
          ...message,
          ...patch,
        }
      })

      this.setData({
        messages,
        scrollIntoView: id,
      })
    },
  },
})
