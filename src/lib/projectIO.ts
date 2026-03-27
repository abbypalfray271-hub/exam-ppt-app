import { useProjectStore, Question } from '@/store/useProjectStore';

/**
 * 项目 JSON 的数据结构
 */
interface ProjectJSON {
  version: string;
  exportedAt: string;
  projectName: string;
  examImageUrl?: string;
  examPages: string[];
  questions: Question[];
  currentMode: 'quick' | 'deep';
}

/**
 * 导出当前项目为 JSON 文件并下载
 */
export function exportProjectJSON() {
  const state = useProjectStore.getState();

  const data: ProjectJSON = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    projectName: state.projectName,
    examImageUrl: state.examImageUrl,
    examPages: state.examPages,
    questions: state.questions,
    currentMode: state.currentMode,
  };

  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  // 文件名：项目名 + 日期
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = `${state.projectName}_${dateStr}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * 从 JSON 文件导入项目数据，恢复到 Store
 * @returns Promise<boolean> 导入是否成功
 */
export function importProjectJSON(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return resolve(false);

      try {
        const text = await file.text();
        const data: ProjectJSON = JSON.parse(text);

        // 基础校验
        if (!data.version || !data.questions || !Array.isArray(data.questions)) {
          alert('无效的项目文件格式');
          return resolve(false);
        }

        // 恢复 Store 状态
        const store = useProjectStore.getState();
        store.setProjectName(data.projectName || '导入的项目');
        if (data.examImageUrl) store.setExamImage(data.examImageUrl);
        store.setExamPages(data.examPages || []);
        store.setQuestions(data.questions);
        store.setMode(data.currentMode || 'quick');
        store.setView('editor');

        resolve(true);
      } catch (err) {
        console.error('Import error:', err);
        alert('导入失败：文件格式错误');
        resolve(false);
      }
    };

    input.click();
  });
}
