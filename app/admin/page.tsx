'use client';

import { useStore } from '@/store/useStore';
import { Database, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

export default function AdminDashboard() {
  const { questions, examConfigs, examAttempts } = useStore();

  const totalQuestions = questions.length;
  const totalConfigs = examConfigs.length;
  const totalRedlines = questions.filter(q => q.isRedline).length;
  const totalAttempts = examAttempts.length;
  
  const passedAttempts = examAttempts.filter(a => a.passed).length;
  const passRate = totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;

  const stats = [
    { title: '总题数', value: totalQuestions, icon: Database, color: 'text-blue-500' },
    { title: '考试配置数', value: totalConfigs, icon: FileText, color: 'text-indigo-500' },
    { title: '红线题数', value: totalRedlines, icon: AlertTriangle, color: 'text-red-500' },
    { title: '平均通过率', value: `${passRate}%`, icon: CheckCircle, color: 'text-green-500' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">数据看板</h2>
          <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">FEISHU SYNCED</span>
        </div>
      </header>
      
      <div className="flex-1 p-6 space-y-6 overflow-y-auto flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-shrink-0">
          {stats.map((stat) => (
            <div key={stat.title} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">{stat.title}</p>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
                {stat.title === '红线题数' && <span className="text-orange-400 text-xs italic">高风险</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[300px]">
          <div className="col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-sm">最新考试记录提示</h3>
              <button className="text-[10px] text-orange-600 font-bold uppercase tracking-tight">查看成绩单 &rarr;</button>
            </div>
            <div className="p-4 text-sm text-slate-500 flex-1 flex items-center justify-center">
              当前培训链路为“飞书资料学习 → 本系统考试认证 → AI情景训练”。情景训练会复用已同步的案例库和题库数据，后续再接入 AI 聊天。
            </div>
          </div>
          
          <div className="col-span-4 flex flex-col gap-6">
            <div className="bg-slate-900 rounded-xl p-5 text-white shadow-lg flex flex-col justify-between h-48">
              <div className="space-y-2">
                <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">飞书同步工具</p>
                <p className="text-sm font-medium">在“题库管理”导入 Excel 或同步最新的 00/01 表格数据</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500 border border-slate-900 flex items-center justify-center text-[8px]">FS</div>
                  <div className="w-6 h-6 rounded-full bg-orange-500 border border-slate-900"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
