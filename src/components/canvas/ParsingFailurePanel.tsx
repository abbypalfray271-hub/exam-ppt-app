'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// ============================================================
// 解析失败诊断报告面板
// 从 ExtractionCanvas.tsx 提取
// ============================================================

export interface ParsingFailure {
  id: string;
  label: string;
  error: string;
}

interface ParsingFailurePanelProps {
  failures: ParsingFailure[];
  isProcessing: boolean;
  onDismiss: () => void;
}

export const ParsingFailurePanel: React.FC<ParsingFailurePanelProps> = ({ failures, isProcessing, onDismiss }) => {
  return (
    <AnimatePresence>
      {!isProcessing && failures.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 200 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className="fixed top-24 right-6 w-80 bg-white border border-red-200 rounded-3xl shadow-2xl z-[150] overflow-hidden"
        >
          <div className="p-5 bg-gradient-to-r from-red-500 to-rose-600 text-white flex items-center justify-between font-black">
            <span>解析任务诊断报告</span>
            <button onClick={onDismiss}><X size={16} /></button>
          </div>
          <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
            {failures.map((f, i) => (
              <div key={f.id} className="p-3 bg-red-50 rounded-xl">
                <div className="text-xs font-black flex justify-between"><span>{f.label}</span><span>#{i + 1}</span></div>
                <div className="text-[10px] text-red-600 mt-1">{f.error}</div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t bg-gray-50 flex flex-col gap-2">
            <p className="text-[10px] text-gray-500 text-center">系统已跳过失败项，您可以手动补录。</p>
            <button onClick={onDismiss} className="w-full py-2 bg-red-500 text-white font-black rounded-xl">确认并继续</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
