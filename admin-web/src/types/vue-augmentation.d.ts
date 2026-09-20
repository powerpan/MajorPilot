import 'vue'
import { useDict } from '@/utils/dict'
import { download } from '@/utils/request'
import { getConfigKey } from '@/api/system/config'
import { parseTime, resetForm, handleTree, addDateRange, selectDictLabel, selectDictLabels } from '@/utils/ruoyi'
import tab from '@/plugins/tab'
import auth from '@/plugins/auth'
import cache from '@/plugins/cache'
import modal from '@/plugins/modal'
import fileDownload from '@/plugins/download'

// Augment the real Vue module; an ambient replacement erased Vue exports.
declare module 'vue' {
  interface ComponentCustomProperties {
    useDict: typeof useDict
    download: typeof download
    getConfigKey: typeof getConfigKey
    parseTime: typeof parseTime
    resetForm: typeof resetForm
    handleTree: typeof handleTree
    addDateRange: typeof addDateRange
    selectDictLabel: typeof selectDictLabel
    selectDictLabels: typeof selectDictLabels
    $tab: typeof tab
    $auth: typeof auth
    $cache: typeof cache
    $modal: typeof modal
    $download: typeof fileDownload
  }
}
