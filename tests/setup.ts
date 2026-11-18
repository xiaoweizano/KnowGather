import { beforeEach } from 'vitest'
import { setLocale } from '../src/renderer/src/i18n'

// Several specs assert the Chinese copy. The i18n module otherwise derives its
// default from `navigator.language`, which makes the suite pass on a zh-CN
// machine and fail on an en-US CI runner. Pin the locale so results do not
// depend on the host; specs that need English pass it explicitly.
beforeEach(() => {
  setLocale('zh-CN')
})
