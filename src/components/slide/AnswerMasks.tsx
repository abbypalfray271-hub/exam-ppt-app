import React from 'react';
import { Question, useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { EyeOff, X } from 'lucide-react';

interface AnswerMasksProps {
  questions: Question[];
  isDrawMode?: boolean;
}

/**
 * 答案与解析遮罩组件
 * 职责：在幻灯片素材上渲染半透明打码块，并支持删除操作
 */
export const AnswerMasks: React.FC<AnswerMasksProps> = ({ questions, isDrawMode = false }) => {
  const masks: React.ReactNode[] = [];
  
  questions.forEach(q => {
    // 渲染答案遮挡区
    if (q.answer_box && q.answer_box.length === 4) {
      const [ymin, xmin, ymax, xmax] = q.answer_box;
      const isTenThousand = q.answer_box.some(v => v > 1000);
      const divisor = isTenThousand ? 100 : 10;
      const top = ymin / divisor;
      const left = xmin / divisor;
      const height = (ymax - ymin) / divisor;
      const width = (xmax - xmin) / divisor;
      
      masks.push(
        <div
          key={`mask-answer-${q.id}`}
          className={cn(
            "absolute z-10 backdrop-blur-2xl bg-white/95 border-2 border-dashed border-gray-400 rounded-lg shadow-xl flex flex-col items-center justify-center transition-all duration-300 group/mask",
            isDrawMode ? "pointer-events-none opacity-20" : "cursor-help hover:opacity-0"
          )}
          style={{ top: `${top}%`, left: `${left}%`, height: `${height}%`, width: `${width}%` }}
          title="此处答案已被打码遮挡 (鼠标移入可查看原图)"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <EyeOff className="w-5 h-5 text-gray-400 mb-1 group-hover/mask:opacity-0 transition-opacity" />
          <span className="text-[10px] font-bold text-gray-400 group-hover/mask:opacity-0 transition-opacity">答案</span>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              const { updateQuestion } = useProjectStore.getState();
              updateQuestion(q.id, { answer_box: undefined });
            }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/mask:opacity-100 transition-opacity shadow-lg hover:bg-red-600 z-20"
            title="删除此错误遮罩"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    // 渲染试题分析区 (紫色主题)
    if (q.analysis_box && q.analysis_box.length === 4) {
      const [ymin, xmin, ymax, xmax] = q.analysis_box;
      const isTenThousand = q.analysis_box.some(v => v > 1000);
      const divisor = isTenThousand ? 100 : 10;
      const top = ymin / divisor;
      const left = xmin / divisor;
      const height = (ymax - ymin) / divisor;
      const width = (xmax - xmin) / divisor;
      
      masks.push(
        <div
          key={`mask-analysis-${q.id}`}
          className={cn(
            "absolute z-10 backdrop-blur-2xl bg-purple-50/95 border-2 border-dashed border-purple-400 rounded-lg shadow-xl flex flex-col items-center justify-center transition-all duration-300 group/mask",
            isDrawMode ? "pointer-events-none opacity-20" : "cursor-help hover:opacity-0"
          )}
          style={{ top: `${top}%`, left: `${left}%`, height: `${height}%`, width: `${width}%` }}
          title="此处试题分析已被隐藏 (鼠标移入可查看原图)"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <EyeOff className="w-5 h-5 text-purple-400 mb-1 group-hover/mask:opacity-0 transition-opacity" />
          <span className="text-[10px] font-bold text-purple-400 group-hover/mask:opacity-0 transition-opacity">分析</span>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              const { updateQuestion } = useProjectStore.getState();
              updateQuestion(q.id, { analysis_box: undefined });
            }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/mask:opacity-100 transition-opacity shadow-lg hover:bg-purple-600 z-20"
            title="删除此分析遮罩"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }
  });
  
  return <>{masks}</>;
};
