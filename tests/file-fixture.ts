import type { RecordFolder } from '../src/lib/record-files';

export function fileFixture(initial: string | null = null) {
  let text = initial;
  let failure = false;
  const folder: RecordFolder = {
    name: '养老金记录',
    async getFileHandle(_name, options) {
      if (text === null && !options?.create) throw new DOMException('missing', 'NotFoundError');
      return {
        async getFile() { return { async text() { return text ?? ''; } }; },
        async createWritable() {
          let pending = '';
          return {
            async write(value) { if (failure) throw new Error('文件保存失败'); pending = value; },
            async close() { text = pending; },
            async abort() {},
          };
        },
      };
    },
  };
  return { folder, read: () => text, replace: (value: string) => { text = value; }, fail: () => { failure = true; } };
}
