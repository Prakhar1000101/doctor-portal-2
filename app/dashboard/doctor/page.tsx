'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  UserCheck,
  Clock,
  FileText,
  RefreshCw,
  Calendar,
  User,
  Mail,
  Phone,
  X,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { auth } from '@/lib/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserRole } from '@/lib/firebase/auth';
import { getDoctorByUserId } from '@/lib/firebase/doctors';
import { getAllAppointments, getAppointmentsByDate, getAppointmentStats } from '@/lib/firebase/appointments';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import * as XLSX from 'xlsx';

// Add type definition at the top of the file after imports
type Appointment = {
  id: string;
  date: Date;
  time: string;
  status: 'scheduled' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled';
  patientId: string;
  patientName: string;
  reason: string;
  createdAt: Date;
  notes: string;
  [key: string]: any;
};

type AppointmentData = {
  id: string;
  date: Date;
  time: string;
  status: string;
  patientId: string;
  patientName: string;
  reason: string;
  createdAt: Date;
  notes: string;
};

export default function DoctorDashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [doctor, setDoctor] = useState<any>(null);
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [allAppointments, setAllAppointments] = useState<any[]>([]);
  const [appointmentStats, setAppointmentStats] = useState({
    total: 0,
    completed: 0,
    waiting: 0,
    inProgress: 0,
    cancelled: 0,
    uniquePatients: 0,
    completionRate: 0
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      try {
        console.log('Checking user role for:', user.uid);
        const role = await getUserRole(user.uid);
        console.log('User role:', role);
        
        if (role !== 'doctor') {
          toast.error('You do not have access to this page');
          router.push('/auth/role-selection');
          return;
        }
        
        try {
          // Get doctor info
          console.log('Fetching doctor info for user:', user.uid);
          const doctorInfo = await getDoctorByUserId(user.uid);
          console.log('Doctor info retrieved:', doctorInfo);
          setDoctor(doctorInfo);

          // Fetch today's appointments and all appointment data
          const doctorId = doctorInfo?.id || user.uid;
          console.log('Using doctorId for appointments:', doctorId);
          
          const todayStats = await fetchTodayAppointments();
          console.log('Today stats:', todayStats);
          
          const allAppointmentsData = await fetchAllAppointments(doctorId);
          console.log('All appointments:', allAppointmentsData?.length || 0);
        } catch (fetchError) {
          console.error('Error fetching doctor data:', fetchError);
          
          // Even if we can't get the doctor profile, we can still try to get appointments
          try {
            console.log('Fallback: using user.uid for appointments:', user.uid);
            const todayStats = await fetchTodayAppointments();
            console.log('Fallback today stats:', todayStats);
            
            const allAppointmentsData = await fetchAllAppointments(user.uid);
            console.log('Fallback all appointments:', allAppointmentsData?.length || 0);
          } catch (appointmentError) {
            console.error('Error fetching appointments:', appointmentError);
            toast.error('Failed to load appointments');
          }
        }
      } catch (error) {
        console.error('Error verifying role:', error);
        toast.error('Error loading dashboard');
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchTodayAppointments = async () => {
    try {
      console.log('🔵 Starting fetchTodayAppointments');
      const today = new Date();
      const appointments = await getAppointmentsByDate(today);
      console.log('✅ Today\'s appointments:', appointments);
      setTodayAppointments(appointments);
      
      // Calculate stats
      const total = appointments.length;
      const completed = appointments.filter(apt => apt.status === 'completed').length;
      const waiting = appointments.filter(apt => 
        apt.status === 'scheduled' || apt.status === 'checked-in'
      ).length;
      const inProgress = appointments.filter(apt => apt.status === 'in-progress').length;
      
      const stats = { total, completed, waiting, inProgress };
      console.log('✅ Today\'s stats calculated:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Error in fetchTodayAppointments:', error);
      toast.error('Error loading today\'s appointments');
      return { total: 0, completed: 0, waiting: 0, inProgress: 0 };
    }
  };

  const fetchAllAppointments = async (doctorId: string) => {
    try {
      console.log('Fetching all appointments');
      
      // Get all appointments without filtering by doctorId
      const appointments = await getAllAppointments();
      
      console.log('All appointments fetched:', appointments?.length || 0);
      
      // Sort appointments by date and time
      const sortedAppointments = appointments.sort((a, b) => {
        if (a.date.getTime() === b.date.getTime()) {
          const timeA = a.time.split(':').map(Number);
          const timeB = b.time.split(':').map(Number);
          return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
        }
        return b.date.getTime() - a.date.getTime(); // Most recent first
      });
      
      setAllAppointments(sortedAppointments);
      
      // Calculate overall stats
      const total = appointments?.length || 0;
      const completed = appointments?.filter(apt => apt.status === 'completed')?.length || 0;
      const waiting = appointments?.filter(apt => apt.status === 'checked-in' || apt.status === 'scheduled')?.length || 0;
      const inProgress = appointments?.filter(apt => apt.status === 'in-progress')?.length || 0;
      const cancelled = appointments?.filter(apt => apt.status === 'cancelled')?.length || 0;

      // Calculate unique patients
      const uniquePatients = new Set(appointments.map(apt => apt.patientId)).size;

      // Calculate completion rate
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      const stats = {
        total,
        completed,
        waiting,
        inProgress,
        cancelled,
        uniquePatients,
        completionRate
      };
      
      console.log('Setting appointment stats:', stats);
      setAppointmentStats(stats);
      
      return appointments;
    } catch (error) {
      console.error('Error fetching all appointments:', error);
      toast.error('Error loading appointments data');
      return [];
    }
  };

  const refreshData = async () => {
    if (!doctor) return;
    
    try {
      setIsRefreshing(true);
      
      const doctorId = doctor.id || (auth.currentUser?.uid as string);
      if (!doctorId) {
        toast.error('Could not determine doctor ID');
        return;
      }
      
      const todayStats = await fetchTodayAppointments();
      const allAppointmentsData = await fetchAllAppointments(doctorId);
      
      console.log('Refreshed today stats:', todayStats);
      console.log('Refreshed all appointments:', allAppointmentsData?.length || 0);
      
      toast.success('Dashboard data refreshed');
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast.error('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Modify the download function to handle dates properly
  const downloadTodayAppointments = () => {
    try {
      // Sort appointments by time
      const sortedAppointments = todayAppointments
        .sort((a, b) => {
          const timeA = a.time.split(':').map(Number);
          const timeB = b.time.split(':').map(Number);
          return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
        });

      // Prepare data for Excel with safe date handling
      const excelData = sortedAppointments.map(appointment => {
        // Safely format the created at date
        let formattedCreatedAt = '';
        try {
          if (appointment.createdAt) {
            // Handle both Date objects and Firestore timestamps
            const createdAtDate = appointment.createdAt instanceof Date 
              ? appointment.createdAt 
              : appointment.createdAt.toDate?.() 
                ? appointment.createdAt.toDate() 
                : new Date(appointment.createdAt);
            formattedCreatedAt = format(createdAtDate, 'yyyy-MM-dd HH:mm');
          }
        } catch (error) {
          console.warn('Error formatting date for appointment:', appointment.id);
          formattedCreatedAt = 'N/A';
        }

        return {
          Time: appointment.time,
          'Patient Name': appointment.patientName || 'Unknown',
          'Reason': appointment.reason || 'N/A',
          'Status': appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1),
          'Patient ID': appointment.patientId || 'N/A',
          'Notes': appointment.notes || '',
          'Created At': formattedCreatedAt
        };
      });

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const colWidths = [
        { wch: 10 },  // Time
        { wch: 25 },  // Patient Name
        { wch: 30 },  // Reason
        { wch: 15 },  // Status
        { wch: 20 },  // Patient ID
        { wch: 30 },  // Notes
        { wch: 20 }   // Created At
      ];
      ws['!cols'] = colWidths;

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Today's Appointments");

      // Generate Excel file
      const today = format(new Date(), 'yyyy-MM-dd');
      XLSX.writeFile(wb, `appointments-${today}.xlsx`);

      toast.success('Appointments downloaded successfully');
    } catch (error) {
      console.error('Error downloading appointments:', error);
      toast.error('Failed to download appointments');
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const upcomingAppointmentsToday = todayAppointments.filter(
    apt => apt.status === 'scheduled' || apt.status === 'checked-in'
  ).sort((a, b) => {
    // Sort by time (convert "10:30 AM" to minutes for comparison)
    const timeA = a.time.split(':').map(Number);
    const timeB = b.time.split(':').map(Number);
    return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
  });

  // Get the next appointment
  const getNextAppointment = () => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    return todayAppointments.find(apt => {
      if (apt.status === 'cancelled') return false;
      const [hours, minutes] = apt.time.split(':').map(Number);
      const appointmentTime = hours * 60 + minutes;
      return appointmentTime > currentTime;
    });
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'checked-in':
        return 'bg-blue-100 text-blue-800';
      case 'in-progress':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-yellow-100 text-yellow-800'; // scheduled
    }
  };

  return (
    <div className="container mx-auto pt-8">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Doctor Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
          <Button 
            variant="outline" 
            className="flex items-center gap-2 h-10"
            onClick={refreshData}
            disabled={isRefreshing}
            title="Refresh dashboard"
          >
            <RefreshCw size={16} className={`${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
          
          <Link href="/dashboard/doctor/appointments">
            <Button>View All Appointments</Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Link href="/dashboard/doctor/appointments" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Appointments</p>
                  <h3 className="text-3xl font-bold mt-1">
                    {isLoading || isRefreshing ? (
                      <div className="h-8 w-12 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      appointmentStats.total
                    )}
                  </h3>
                </div>
                <div className="p-3 bg-primary/10 rounded-full flex items-center justify-center">
                  <CalendarClock className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/doctor/appointments?status=completed" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Completed</p>
                  <h3 className="text-3xl font-bold mt-1">
                    {isLoading || isRefreshing ? (
                      <div className="h-8 w-12 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      appointmentStats.completed
                    )}
                  </h3>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/doctor/appointments?status=scheduled" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Waiting/Scheduled</p>
                  <h3 className="text-3xl font-bold mt-1">
                    {isLoading || isRefreshing ? (
                      <div className="h-8 w-12 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      appointmentStats.waiting
                    )}
                  </h3>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/doctor/appointments?status=cancelled" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Cancelled</p>
                  <h3 className="text-3xl font-bold mt-1">
                    {isLoading || isRefreshing ? (
                      <div className="h-8 w-12 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      appointmentStats.cancelled
                    )}
                  </h3>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <X className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Today's Appointments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Today's Appointments</CardTitle>
            <CardDescription>
              Patients scheduled for today
              {!isLoading && (
                <span className="text-xs text-gray-500 ml-2">
                  ({todayAppointments.length} appointment{todayAppointments.length !== 1 ? 's' : ''})
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTodayAppointments}
              className="flex items-center gap-2"
              title="Download today's appointments"
            >
              <Download size={16} />
              Download
            </Button>
            <Badge variant="outline" className="ml-auto">
              {format(new Date(), 'MMMM d, yyyy')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || isRefreshing ? (
            <div className="py-6 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p className="text-sm text-gray-500">Loading appointments...</p>
            </div>
          ) : todayAppointments.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Time</th>
                      <th className="text-left py-3 px-4">Patient</th>
                      <th className="text-left py-3 px-4">Reason</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayAppointments
                      .sort((a, b) => {
                        const timeA = a.time.split(':').map(Number);
                        const timeB = b.time.split(':').map(Number);
                        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
                      })
                      .slice(0, 5) // Show only first 5 appointments
                      .map((appointment) => (
                        <tr key={appointment.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">{appointment.time}</td>
                          <td className="py-3 px-4">{appointment.patientName || "Unknown"}</td>
                          <td className="py-3 px-4">{appointment.reason}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-1 rounded-full text-xs uppercase font-semibold ${
                                appointment.status === 'completed' ? 'bg-green-100 text-green-800' :
                                appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                appointment.status === 'checked-in' ? 'bg-blue-100 text-blue-800' :
                                appointment.status === 'in-progress' ? 'bg-purple-100 text-purple-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {appointment.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link href={`/dashboard/doctor/appointments/${appointment.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {todayAppointments.length > 5 && (
                <div className="flex justify-center mt-4">
                  <Link href="/dashboard/doctor/appointments">
                    <Button variant="outline">
                      View All {todayAppointments.length} Appointments
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No appointments scheduled for today</p>
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Your schedule is clear for today</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}