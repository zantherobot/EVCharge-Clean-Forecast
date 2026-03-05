import React, { useState, useEffect, useMemo } from 'react';
import { findBestWindow } from './shared';
import {
  Leaf,
  Zap,
  Clock,
  Calendar,
  Info,
  Car,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { format, addHours, isSameDay, parseISO, startOfHour } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from 'recharts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface EmissionData {
  timestamp: string;
  intensity: number;
  marginalFuel: string;
}

interface MonthlyAverage {
  month: string;
  hours: { hour: number; intensity: number }[];
}

export default function App() {
  const [data, setData] = useState<EmissionData[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyAverage[]>([]);
  const [viewMode, setViewMode] = useState<'forecast' | 'monthly'>('forecast');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [dataSource, setDataSource] = useState<string>('loading');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chargeDuration, setChargeDuration] = useState(4); // hours
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/emissions');
      const json = await response.json();
      
      if (!response.ok) {
        throw new Error(json.error || 'Failed to fetch data');
      }
      
      setData(json.data);
      setDataSource(json.source);
      if (json.data.length > 0) {
        const ptNow = toPT(new Date().toISOString());
        const todayStr = format(ptNow, 'yyyy-MM-dd');
        
        const hasToday = json.data.some((d: any) => {
          const ptDate = toPT(d.timestamp);
          return format(ptDate, 'yyyy-MM-dd') === todayStr;
        });
        
        if (hasToday) {
          setSelectedDay(todayStr);
        } else {
          const lastPtDate = toPT(json.data[json.data.length - 1].timestamp);
          setSelectedDay(format(lastPtDate, 'yyyy-MM-dd'));
        }
      }

      // Monthly averages fetch removed — view is hidden for now
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatInPT = (date: Date, formatStr: string) => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      // We use a trick to format with date-fns by first converting to a PT-relative date string
      // but simpler is just to use Intl for the whole thing if we want strict PT.
      // However, for consistency with the existing code, let's just use a helper.
    }).format(date);
  };

  // A more robust way to handle PT display regardless of user location
  const toPT = (dateStr: string) => {
    return new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  };
  const days = useMemo(() => {
    const uniqueDays = new Set<string>();
    data.forEach(item => {
      const ptDate = toPT(item.timestamp);
      uniqueDays.add(format(ptDate, 'yyyy-MM-dd'));
    });
    return Array.from(uniqueDays).sort();
  }, [data]);

  const filteredData = useMemo(() => {
    if (!selectedDay) return [];
    return data.filter(item => {
      const ptDate = toPT(item.timestamp);
      return format(ptDate, 'yyyy-MM-dd') === selectedDay;
    });
  }, [data, selectedDay]);

  const bestWindow = useMemo(() => {
    return findBestWindow(data, chargeDuration, new Date());
  }, [data, chargeDuration]);

  const currentIntensity = useMemo(() => {
    const pastData = data.filter(d => new Date(d.timestamp) <= new Date());
    if (pastData.length > 0) return pastData[pastData.length - 1].intensity;
    return data.length > 0 ? data[0].intensity : 0;
  }, [data]);
  const isGoodTimeToCharge = bestWindow ? currentIntensity <= bestWindow.avgIntensity * 1.1 : true;

  // Find timestamps in the 12am–3pm cheapest electricity rate window for the selected day
  const cheapRateRange = useMemo(() => {
    if (!selectedDay) return null;
    const inRange = filteredData.filter(d => {
      const ptDate = toPT(d.timestamp);
      const hour = ptDate.getHours();
      return hour >= 0 && hour < 15; // 12am (0) to 2:59pm (14)
    });
    if (inRange.length < 2) return null;
    return { start: inRange[0].timestamp, end: inRange[inRange.length - 1].timestamp };
  }, [filteredData, selectedDay]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin" />
          <p className="text-zinc-500 font-medium">Analyzing grid patterns...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center font-sans p-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm max-w-md w-full text-center border border-red-100">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-900 mb-2">Something went wrong</h2>
          <p className="text-zinc-500 mb-6">{error}</p>
          <button 
            onClick={fetchData}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0 && !loading && !error) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center font-sans p-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm max-w-md w-full text-center border border-zinc-200">
          <Info className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-900 mb-2">No data available</h2>
          <p className="text-zinc-500 mb-6">We couldn't find any emissions data for the CAISO region at this time. Please check back later.</p>
          <button 
            onClick={fetchData}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-zinc-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white fill-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">EV Charging Clean Forecast</h1>
              <span className={cn(
                "ml-2 px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-widest",
                dataSource === 'watttime' ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-600"
              )}>
                {dataSource === 'watttime' ? 'Live Grid' : 'Simulated'}
              </span>
            </div>
            <p className="text-zinc-500 text-sm">Marginal Carbon Emissions Forecast</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Monthly Averages toggle hidden for now — kept in code for future use
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border border-zinc-200">
              <button
                onClick={() => setViewMode('forecast')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  viewMode === 'forecast' ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                Forecast
              </button>
              <button
                onClick={() => setViewMode('monthly')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  viewMode === 'monthly' ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                Monthly Averages
              </button>
            </div>
            */}

            {viewMode === 'forecast' && (
              <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-zinc-200">
                {[2, 4, 8, 12].map((h) => (
                  <button
                    key={h}
                    onClick={() => setChargeDuration(h)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      chargeDuration === h 
                        ? "bg-zinc-900 text-white shadow-sm" 
                        : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                    )}
                  >
                    {h}h Charge
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {viewMode === 'forecast' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Summary & Best Time */}
            <div className="lg:col-span-1 space-y-6">
              {/* Status Card */}
              <div className={cn(
                "p-6 rounded-3xl shadow-sm border transition-all",
                isGoodTimeToCharge 
                  ? "bg-emerald-50 border-emerald-100" 
                  : "bg-amber-50 border-amber-100"
              )}>
                <div className="flex items-start justify-between mb-4">
                  <div className={cn(
                    "p-3 rounded-2xl",
                    isGoodTimeToCharge ? "bg-emerald-500" : "bg-amber-500"
                  )}>
                    <Car className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60">Current Intensity</span>
                    <div className="text-3xl font-light leading-none mt-1">
                      {Math.round(currentIntensity)}
                      <span className="text-sm font-medium ml-1">lbs/MWh</span>
                    </div>
                  </div>
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  {isGoodTimeToCharge ? "Good time to charge" : "Wait if you can"}
                </h2>
                <p className="text-sm opacity-80 leading-relaxed">
                  {isGoodTimeToCharge 
                    ? "The grid is currently powered by a high percentage of renewables. Charging now minimizes your carbon footprint."
                    : "Emissions are currently elevated. Consider waiting for a cleaner window to reduce your environmental impact."}
                </p>
              </div>

              {/* Recommendation Card */}
              {bestWindow && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-200">
                  <div className="flex items-center gap-2 mb-4 text-zinc-400">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Optimal Window</span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-zinc-500 mb-1">Start Time</div>
                      <div className="text-lg font-semibold">
                        {format(toPT(bestWindow.start.timestamp), 'EEEE, MMM d')}
                      </div>
                      <div className="text-2xl font-bold text-emerald-600">
                        {format(toPT(bestWindow.start.timestamp), 'h:mm a')} PT
                      </div>
                    </div>
                    <div className="pt-4 border-t border-zinc-100">
                      <div className="flex justify-between items-end">
                        <div>
                          <div className="text-sm text-zinc-500 mb-1">Avg. Intensity</div>
                          <div className="text-xl font-bold">
                            {Math.round(bestWindow.avgIntensity)}
                            <span className="text-xs font-medium ml-1 text-zinc-400">lbs/MWh</span>
                          </div>
                        </div>
                        <div className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
                          -{Math.round(((currentIntensity - bestWindow.avgIntensity) / currentIntensity) * 100)}% Cleaner
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Methodology Card */}
              <div className="bg-zinc-900 text-white p-6 rounded-3xl shadow-sm overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Methodology</span>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                    This dashboard uses <strong>marginal carbon emissions</strong> data from the <a href="https://watttime.org/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline">WattTime API</a>. Marginal emissions identify which power plant would turn on or off in response to a change in demand — the correct metric for deciding <strong>when</strong> to use energy.
                  </p>
                  <a
                    href="https://watttime.org/data-science/methodology-validation/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Learn More <ChevronRight className="w-3 h-3" />
                  </a>
                </div>
                <div className="absolute -bottom-6 -right-6 opacity-10">
                  <Leaf className="w-32 h-32" />
                </div>
              </div>
            </div>

            {/* Right Column: Chart & Forecast */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <div>
                    <h3 className="text-lg font-bold">Emissions Forecast</h3>
                    <p className="text-sm text-zinc-500">
                      72-hour forecast for CAISO territory
                    </p>
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                    {days.map((day) => (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                          selectedDay === day 
                            ? "bg-zinc-100 text-zinc-900" 
                            : "text-zinc-400 hover:text-zinc-600"
                        )}
                      >
                        {format(parseISO(day), 'EEE d')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={filteredData}>
                      <defs>
                        <linearGradient id="colorIntensity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="timestamp" 
                        tickFormatter={(str) => {
                          const ptDate = new Date(new Date(str).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
                          return format(ptDate, 'h a');
                        }}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#a1a1aa' }}
                        minTickGap={30}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#a1a1aa' }}
                        label={{ value: 'lbs CO2/MWh', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#a1a1aa' } }}
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload as EmissionData;
                            const ptDate = new Date(new Date(d.timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
                            return (
                              <div className="bg-white p-3 rounded-xl shadow-xl border border-zinc-100 text-xs">
                                <p className="font-bold text-zinc-900 mb-1">{format(ptDate, 'h:mm a')} PT</p>
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <p className="text-zinc-600">Intensity: <span className="font-bold text-zinc-900">{Math.round(d.intensity)} lbs/MWh</span></p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-zinc-400" />
                                  <p className="text-zinc-600">Fuel: <span className="font-medium text-zinc-900">{d.marginalFuel}</span></p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="intensity" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorIntensity)" 
                      />
                      {cheapRateRange && (
                        <ReferenceArea
                          x1={cheapRateRange.start}
                          x2={cheapRateRange.end}
                          fill="#3b82f6"
                          fillOpacity={0.08}
                          stroke="#3b82f6"
                          strokeOpacity={0.3}
                          strokeDasharray="3 3"
                          label={{ value: 'Cheapest Rate (12am–3pm)', position: 'insideTop', fill: '#3b82f6', fontSize: 9, fontWeight: 'bold', offset: 15 }}
                        />
                      )}
                      {bestWindow && isSameDay(parseISO(bestWindow.start.timestamp), parseISO(selectedDay || '')) && (
                        <ReferenceLine 
                          x={bestWindow.start.timestamp} 
                          stroke="#10b981" 
                          strokeDasharray="3 3"
                          label={{ position: 'top', value: 'Best Start', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* Monthly Averages View */
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                <div>
                  <h3 className="text-2xl font-bold mb-2">Monthly Grid Profiles</h3>
                  <p className="text-zinc-500">Typical 24-hour marginal emissions by month</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {monthlyData.map((m, idx) => (
                    <button
                      key={m.month}
                      onClick={() => setSelectedMonth(idx)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                        selectedMonth === idx 
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" 
                          : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                      )}
                    >
                      {m.month.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {monthlyData[selectedMonth] && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
                  <div className="lg:col-span-3 h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyData[selectedMonth].hours}>
                        <defs>
                          <linearGradient id="colorMonthly" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="hour" 
                          tickFormatter={(h) => h === 0 ? '12am' : h === 12 ? '12pm' : h > 12 ? `${h-12}pm` : `${h}am`}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: '#a1a1aa' }}
                        />
                        <YAxis 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: '#a1a1aa' }}
                          domain={[0, 'auto']}
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              const h = d.hour;
                              const timeStr = h === 0 ? '12:00 AM' : h === 12 ? '12:00 PM' : h > 12 ? `${h-12}:00 PM` : `${h}:00 AM`;
                              return (
                                <div className="bg-white p-3 border border-zinc-200 rounded-xl shadow-xl">
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">{timeStr}</p>
                                  <p className="text-lg font-bold text-zinc-900">
                                    {Math.round(d.intensity)} <span className="text-xs font-normal text-zinc-500">lbs/MWh</span>
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="intensity" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorMonthly)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className="space-y-8">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Seasonal Insight</h4>
                      <p className="text-sm text-zinc-600 leading-relaxed italic">
                        {selectedMonth >= 2 && selectedMonth <= 4 ? "Spring in California sees massive solar production. Mid-day emissions are often near zero or even negative as renewables dominate the grid." :
                         selectedMonth >= 5 && selectedMonth <= 8 ? "Summer peaks are driven by air conditioning. The evening ramp is particularly steep as solar disappears while demand remains high." :
                         "Winter months show higher morning and evening peaks due to heating demand and shorter daylight hours for solar generation."}
                      </p>
                    </div>
                    
                    <div className="p-4 bg-zinc-50 rounded-2xl">
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Month Stats</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-xs text-zinc-500">Daily Avg</span>
                          <span className="text-xs font-bold">{Math.round(monthlyData[selectedMonth].hours.reduce((a, b) => a + b.intensity, 0) / 24)} lbs</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-zinc-500">Best Hour</span>
                          <span className="text-xs font-bold text-emerald-600">
                            {monthlyData[selectedMonth].hours.reduce((prev, curr) => prev.intensity < curr.intensity ? prev : curr).hour}:00
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="pt-6 pb-2 text-center text-sm text-zinc-400">
          <div className="flex items-center justify-center gap-2">
            <span>Built by</span>
            <a
              href="https://www.linkedin.com/in/henry-a-white/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-700 transition-colors font-medium"
            >
              Henry White
            </a>
            <span>&middot;</span>
            <a
              href="https://github.com/zantherobot/EVCharge-Clean-Forecast"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-700 transition-colors font-medium"
            >
              Source Code
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
