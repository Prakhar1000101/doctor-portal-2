'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Calendar as CalendarIcon, 
  Clock, 
  Save,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { auth } from '@/lib/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserRole } from '@/lib/firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { 
  getAppointment, 
  updateAppointment,
  getAvailableTimeSlots,
  ALL_TIME_SLOTS
} from '@/lib/firebase/appointments';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from '@/components/ui/calendar';
import Link from 'next/link';
import { toast } from 'sonner';

export default function EditAppointmentPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [appointment, setAppointment] = useState<any>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [isLoadingTimeSlots, setIsLoadingTimeSlots] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    date: new Date(),
    time: '',
    reason: '',
    notes: '',
    patientName: '',
    patientId: '',
    status: 'scheduled' as 'scheduled' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled'
  });

  useEffect(() => {
    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      try {
        const role = await getUserRole(user.uid);
        if (role !== 'doctor') {
          toast.error('You do not have access to this page');
          router.push('/auth/role-selection');
          return;
        }
        
        // Load appointment data
        await fetchAppointment(params.id);
      } catch (error) {
        console.error('Error verifying role:', error);
        toast.error('Error verifying permissions');
        setIsLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
    };
  }, [router, params.id]);

  const fetchAppointment = async (appointmentId: string) => {
    try {
      const appointmentData = await getAppointment(appointmentId);
      
      if (!appointmentData) {
        toast.error('Appointment not found');
        router.push('/dashboard/doctor/appointments');
        return;
      }
      
      setAppointment(appointmentData);
      
      // Set form data from appointment
      setFormData({
        date: appointmentData.date,
        time: appointmentData.time || '',
        reason: appointmentData.reason || '',
        notes: appointmentData.notes || '',
        patientName: appointmentData.patientName || '',
        patientId: appointmentData.patientId || '',
        status: appointmentData.status || 'scheduled'
      });
      
      // Fetch available time slots for the appointment date
      await fetchAvailableTimeSlots(appointmentData.date, appointmentId);
      
      // Ensure we keep the original time slot selected even if not in available slots
      if (appointmentData.time) {
        setFormData(prev => ({ ...prev, time: appointmentData.time }));
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching appointment:', error);
      toast.error('Failed to load appointment details');
      setIsLoading(false);
    }
  };

  const fetchAvailableTimeSlots = async (date: Date, appointmentId: string) => {
    try {
      setIsLoadingTimeSlots(true);
      console.log(`Fetching available time slots for date ${format(date, 'yyyy-MM-dd')} for appointment ${appointmentId}`);
      const slots = await getAvailableTimeSlots(date, appointmentId);
      console.log(`Received ${slots.length} available slots:`, slots);
      
      // Ensure the original appointment time is included in available slots
      if (appointment && appointment.time && date.toDateString() === appointment.date.toDateString()) {
        // If date is the same as the original appointment date, include the original time slot
        if (!slots.includes(appointment.time)) {
          slots.push(appointment.time);
          // Sort the slots to maintain the correct order
          slots.sort();
        }
        console.log(`Ensured original time slot "${appointment.time}" is included in available slots.`);
      }
      
      setAvailableTimeSlots(slots);
      
      // Only reset time if date is different from original appointment date
      if (formData.time && !slots.includes(formData.time) && 
          (!appointment || date.toDateString() !== appointment.date.toDateString())) {
        console.log(`Current time ${formData.time} is not available on the new date, resetting time selection`);
        setFormData(prev => ({ ...prev, time: '' }));
      }
      
      setIsLoadingTimeSlots(false);
    } catch (error) {
      console.error('Error fetching available time slots:', error);
      setAvailableTimeSlots(ALL_TIME_SLOTS); // Fallback to all slots
      setIsLoadingTimeSlots(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // Validate form
      if (!formData.date || !formData.time || !formData.reason) {
        toast.error('Please fill in all required fields');
        setIsSaving(false);
        return;
      }
      
      // Update appointment
      await updateAppointment(params.id, {
        date: formData.date,
        time: formData.time,
        reason: formData.reason,
        notes: formData.notes,
        status: formData.status,
        patientId: formData.patientId,
        patientName: formData.patientName
      });
      
      toast.success('Appointment updated successfully');
      
      // Redirect back to appointment detail page
      router.push(`/dashboard/doctor/appointments/${params.id}`);
    } catch (error) {
      console.error('Error updating appointment:', error);
      toast.error('Failed to update appointment');
      setIsSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStatusChange = (value: string) => {
    setFormData(prev => ({ 
      ...prev, 
      status: value as 'scheduled' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled' 
    }));
  };

  const handleTimeChange = (value: string) => {
    setFormData(prev => ({ ...prev, time: value }));
  };

  const handleDateChange = async (date: Date | undefined) => {
    if (date) {
      // Update form date
      setFormData(prev => ({ ...prev, date, time: '' })); // Reset time when date changes
      
      // Fetch available time slots for the new date
      await fetchAvailableTimeSlots(date, params.id);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto pt-8">
      <div className="flex items-center mb-8">
        <Link href={`/dashboard/doctor/appointments/${params.id}`} className="mr-4">
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Appointment</h1>
          <p className="text-gray-500 mt-1">
            Make changes to appointment details
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appointment Information</CardTitle>
          <CardDescription>
            Update the details of this appointment
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Date picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Appointment Date*</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date ? format(formData.date, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={handleDateChange}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time select dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Appointment Time*</label>
              <Select
                value={formData.time || undefined}
                onValueChange={handleTimeChange}
                disabled={isLoadingTimeSlots || availableTimeSlots.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isLoadingTimeSlots ? "Loading..." : "Choose a time slot"} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingTimeSlots ? (
                    <SelectItem value="loading" disabled>Loading available times...</SelectItem>
                  ) : availableTimeSlots.length === 0 ? (
                    <SelectItem value="no-slots" disabled>No available slots</SelectItem>
                  ) : (
                    <>
                      {availableTimeSlots.map((slot) => (
                        <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {availableTimeSlots.length === 0 && !isLoadingTimeSlots && (
                <p className="text-sm text-destructive">No available time slots for this date</p>
              )}
            </div>
          </div>

          {/* Patient name (readonly since it's linked to a patient) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Patient Name*</label>
            <Input
              name="patientName"
              value={formData.patientName}
              onChange={handleInputChange}
              readOnly
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status*</label>
            <Select
              value={formData.status}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="checked-in">Checked In</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reason for visit */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason for Visit*</label>
            <Textarea
              name="reason"
              placeholder="Enter reason for visit"
              value={formData.reason}
              onChange={handleInputChange}
              rows={3}
            />
          </div>

          {/* Clinical notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Clinical Notes</label>
            <Textarea
              name="notes"
              placeholder="Enter clinical notes (optional)"
              value={formData.notes}
              onChange={handleInputChange}
              rows={5}
            />
          </div>
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/doctor/appointments/${params.id}`)}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={isSaving || !formData.time}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 