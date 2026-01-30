import React from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, parseISO } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export const WeeklyChart: React.FC = () => {
  const { transactions } = useAppContext();
  const today = new Date();
  const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
  const end = endOfWeek(today, { weekStartsOn: 1 });
  
  const days = eachDayOfInterval({ start, end });
  
  const data = {
    labels: days.map(d => format(d, 'EEE')), // Mon, Tue...
    datasets: [
      {
        label: 'Income',
        data: days.map(day => 
          transactions
            .filter(t => isSameDay(parseISO(t.date), day) && t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0)
        ),
        backgroundColor: 'rgba(34, 197, 94, 0.5)', // green-500
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
      },
      {
        label: 'Expense',
        data: days.map(day => 
          transactions
            .filter(t => isSameDay(parseISO(t.date), day) && t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0)
        ),
        backgroundColor: 'rgba(239, 68, 68, 0.5)', // red-500
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { boxWidth: 10, font: { size: 10 } }
      },
    },
    scales: {
      y: { beginAtZero: true, ticks: { display: false } },
      x: { grid: { display: false } }
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm h-64">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Weekly Overview</h3>
      <div className="h-48">
        <Bar data={data} options={options} />
      </div>
    </div>
  );
};
