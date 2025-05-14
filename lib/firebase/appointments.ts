'use client';

import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp 
} from 'firebase/firestore';
import { db } from './config';
import { format } from 'date-fns';

export type Appointment = {
  id?: string;
  patientId: string;
  patientName?: string;
  date: Date;
  time: string;
  reason: string;
  notes?: string;
  status: 'scheduled' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled';
  createdAt?: string;
};

// Add a new appointment
export const addAppointment = async (appointmentData: Omit<Appointment, 'status' | 'createdAt'>) => {
  try {
    console.log('📝 Adding new appointment:', appointmentData);
    
    // Ensure date is a Firestore timestamp
    const appointmentWithTimestamp = {
      ...appointmentData,
      date: Timestamp.fromDate(appointmentData.date),
      status: 'scheduled',
      createdAt: Timestamp.now()
    };
    
    console.log('📝 Processed appointment data:', {
      date: appointmentWithTimestamp.date.toDate().toISOString(),
      time: appointmentWithTimestamp.time,
      patientName: appointmentWithTimestamp.patientName,
      status: appointmentWithTimestamp.status
    });

    const appointmentRef = await addDoc(collection(db, 'appointments'), appointmentWithTimestamp);
    console.log('✅ Appointment created with ID:', appointmentRef.id);
    
    return appointmentRef.id;
  } catch (error: any) {
    console.error('❌ Error adding appointment:', error);
    throw new Error(error.message);
  }
};

// Update an appointment
export const updateAppointment = async (appointmentId: string, appointmentData: Partial<Appointment>) => {
  try {
    const appointmentRef = doc(db, 'appointments', appointmentId);
    
    // Convert date to Timestamp if it exists
    // Use 'any' type to avoid the TypeScript error with Timestamp
    const updateData: any = { ...appointmentData };
    if (updateData.date) {
      updateData.date = Timestamp.fromDate(updateData.date);
    }
    
    await updateDoc(appointmentRef, updateData);
    return true;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// Delete an appointment
export const deleteAppointment = async (appointmentId: string) => {
  try {
    await deleteDoc(doc(db, 'appointments', appointmentId));
    return true;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// Get an appointment by ID
export const getAppointment = async (appointmentId: string) => {
  try {
    const appointmentDoc = await getDoc(doc(db, 'appointments', appointmentId));
    
    if (!appointmentDoc.exists()) {
      throw new Error('Appointment not found');
    }
    
    const data = appointmentDoc.data();
    
    return {
      id: appointmentDoc.id,
      ...data,
      date: data.date.toDate(),
      createdAt: data.createdAt.toDate().toISOString()
    } as Appointment;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// Get all appointments for a specific date
export const getAppointmentsByDate = async (date: Date) => {
  try {
    console.log('🔍 Getting appointments for date:', date.toISOString());
    
    // Get all appointments and filter in memory
    const appointmentsRef = collection(db, 'appointments');
    const appointmentSnapshot = await getDocs(appointmentsRef);
    
    console.log('📊 Total appointments in database:', appointmentSnapshot.docs.length);
    
    // Format the target date as YYYY-MM-DD for string comparison
    const targetDateStr = format(date, 'yyyy-MM-dd');
    console.log('🎯 Target date for comparison:', targetDateStr);
    
    // Process and filter appointments
    const appointments = appointmentSnapshot.docs
      .map(doc => {
        const data = doc.data();
        try {
          const appointmentDate = data.date.toDate();
          // Format the appointment date as YYYY-MM-DD for string comparison
          const appointmentDateStr = format(appointmentDate, 'yyyy-MM-dd');
          
          console.log('📝 Processing appointment:', {
            id: doc.id,
            date: appointmentDate.toISOString(),
            dateFormatted: appointmentDateStr,
            targetDate: targetDateStr,
            matches: appointmentDateStr === targetDateStr,
            time: data.time,
            patientName: data.patientName,
            status: data.status
          });
          
          return {
            id: doc.id,
            ...data,
            date: appointmentDate,
            createdAt: data.createdAt?.toDate() || new Date()
          } as Appointment;
        } catch (error) {
          console.error('❌ Error processing appointment:', error, 'Raw date value:', data.date);
          return null;
        }
      })
      .filter((apt): apt is Appointment => apt !== null)
      .filter(apt => {
        // Compare dates as strings in YYYY-MM-DD format
        const aptDateStr = format(apt.date, 'yyyy-MM-dd');
        const targetDateStr = format(date, 'yyyy-MM-dd');
        const matches = aptDateStr === targetDateStr;
        
        if (!matches) {
          console.log('❌ Appointment filtered out:', {
            id: apt.id,
            appointmentDate: apt.date.toISOString(),
            appointmentDateStr: aptDateStr,
            targetDateStr: targetDateStr
          });
        }
        return matches;
      });

    // Sort by time
    const sortedAppointments = appointments.sort((a, b) => {
      const timeA = a.time.split(' ')[0].split(':').map(Number);
      const timeB = b.time.split(' ')[0].split(':').map(Number);
      return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
    });

    console.log('✅ Returning sorted appointments:', sortedAppointments.length);
    return sortedAppointments;
  } catch (error: any) {
    console.error('❌ Error getting appointments by date:', error);
    throw new Error(error.message);
  }
};

// Get all appointments for a specific doctor
export const getAppointmentsByDoctor = async (doctorId: string, date?: Date) => {
  try {
    let appointmentsQuery;
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      appointmentsQuery = query(
        collection(db, 'appointments'),
        where('doctorId', '==', doctorId),
        where('date', '>=', Timestamp.fromDate(startOfDay)),
        where('date', '<=', Timestamp.fromDate(endOfDay)),
        orderBy('date'),
        orderBy('time')
      );
    } else {
      appointmentsQuery = query(
        collection(db, 'appointments'),
        where('doctorId', '==', doctorId),
        orderBy('date'),
        orderBy('time')
      );
    }
    
    const appointmentSnapshot = await getDocs(appointmentsQuery);
    
    return appointmentSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: data.date.toDate(),
        createdAt: data.createdAt.toDate().toISOString()
      } as Appointment;
    });
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// Get all appointments for a specific patient
export const getAppointmentsByPatient = async (patientId: string) => {
  try {
    console.log('🔵 Getting appointments for patient ID:', patientId);
    
    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('patientId', '==', patientId),
      orderBy('date', 'desc'),
      orderBy('time')
    );
    
    console.log('🔵 Query created, attempting to get documents...');
    const appointmentSnapshot = await getDocs(appointmentsQuery);
    
    console.log(`✅ Retrieved ${appointmentSnapshot.docs.length} appointments for this patient`);
    
    const results = appointmentSnapshot.docs.map(doc => {
      const data = doc.data();
      try {
        return {
          id: doc.id,
          ...data,
          date: data.date.toDate(),
          createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString()
        } as Appointment;
      } catch (e) {
        console.error('❌ Error processing appointment document:', e);
        // Return a basic version with the current date as fallback
        return {
          id: doc.id,
          ...data,
          date: new Date(),
          createdAt: new Date().toISOString()
        } as Appointment;
      }
    });
    
    console.log('✅ Processed appointment data:', results);
    return results;
  } catch (error: any) {
    console.error('❌ Error fetching patient appointments:', error);
    
    // Check for index errors specifically
    if (error.message && error.message.includes('index')) {
      console.error('This appears to be a Firebase index error. Check Firebase console to create required index.');
      
      // Attempt a simpler query without orderBy as fallback
      try {
        console.log('🟡 Attempting fallback query without ordering...');
        const simpleQuery = query(
          collection(db, 'appointments'),
          where('patientId', '==', patientId)
        );
        
        const snapshot = await getDocs(simpleQuery);
        
        console.log(`✅ Fallback retrieved ${snapshot.docs.length} appointments`);
        
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            date: data.date?.toDate() || new Date(),
            createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString()
          } as Appointment;
        }).sort((a, b) => b.date.getTime() - a.date.getTime()); // Manual sort
      } catch (fallbackError) {
        console.error('❌ Fallback query also failed:', fallbackError);
        return []; // Return empty array as last resort
      }
    }
    
    throw new Error(`Failed to get patient appointments: ${error.message}`);
  }
};

// Update appointment status
export const updateAppointmentStatus = async (
  appointmentId: string, 
  status: 'scheduled' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled'
) => {
  try {
    const appointmentRef = doc(db, 'appointments', appointmentId);
    await updateDoc(appointmentRef, { status });
    return true;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// Get all appointments - implement a safer approach that doesn't require a composite index
export const getAllAppointments = async () => {
  try {
    console.log('🔍 Getting all appointments');
    
    // Use a simple query that doesn't require a composite index
    const appointmentsRef = collection(db, 'appointments');
    const appointmentSnapshot = await getDocs(appointmentsRef);
    
    console.log('📊 Total appointments in database:', appointmentSnapshot.docs.length);
    
    const appointments = appointmentSnapshot.docs.map(doc => {
      const data = doc.data();
      console.log('📝 Processing appointment:', {
        id: doc.id,
        date: data.date?.toDate?.()?.toISOString(),
        time: data.time,
        patientName: data.patientName,
        status: data.status
      });
      
      // Handle the date conversion safely
      let appointmentDate = new Date();
      try {
        if (data.date && typeof data.date.toDate === 'function') {
          appointmentDate = data.date.toDate();
        }
      } catch (e) {
        console.error('❌ Error converting date:', e);
      }
      
      // Create the appointment object
      return {
        id: doc.id,
        patientId: data.patientId || '',
        patientName: data.patientName || '',
        date: appointmentDate,
        time: data.time || '',
        reason: data.reason || '',
        notes: data.notes || '',
        status: data.status || 'scheduled',
        createdAt: data.createdAt?.toDate() || new Date()
      } as Appointment;
    });
    
    // Sort by date and time
    const sortedAppointments = appointments.sort((a, b) => {
      // First sort by date
      const dateCompare = b.date.getTime() - a.date.getTime();
      if (dateCompare !== 0) return dateCompare;
      
      // If same date, sort by time
      const timeA = a.time.split(' ')[0].split(':').map(Number);
      const timeB = b.time.split(' ')[0].split(':').map(Number);
      return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
    });
    
    console.log('✅ Returning sorted appointments:', sortedAppointments.length);
    return sortedAppointments;
  } catch (error: any) {
    console.error('❌ Error fetching all appointments:', error);
    throw new Error('Failed to fetch appointments. Please try again later.');
  }
};

// Get appointment statistics
export const getAppointmentStats = async () => {
  try {
    // Get all appointments
    const appointments = await getAllAppointments();
    
    // Calculate statistics
    const total = appointments.length;
    const completed = appointments.filter(apt => apt.status === 'completed').length;
    const waiting = appointments.filter(apt => 
      apt.status === 'scheduled' || 
      apt.status === 'checked-in' || 
      apt.status === 'in-progress'
    ).length;
    const cancelled = appointments.filter(apt => apt.status === 'cancelled').length;
    
    return {
      total,
      completed,
      waiting,
      cancelled,
    };
  } catch (error: any) {
    console.error('Error calculating appointment statistics:', error);
    // Return default values on error
    return {
      total: 0,
      completed: 0,
      waiting: 0,
      cancelled: 0,
    };
  }
};

// Get booked time slots for a specific date
export const getBookedTimeSlots = async (date: Date) => {
  try {
    console.log('🔵 Checking booked time slots for date:', format(date, 'yyyy-MM-dd'));
    
    // Prepare date range for the selected day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    console.log('🔵 Date range:', {
      start: startOfDay.toISOString(),
      end: endOfDay.toISOString()
    });
    
    // Query all appointments for the selected date
    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('date', '>=', Timestamp.fromDate(startOfDay)),
      where('date', '<=', Timestamp.fromDate(endOfDay)),
      // Only include active appointments (not cancelled ones)
      where('status', 'in', ['scheduled', 'checked-in', 'in-progress', 'completed'])
    );
    
    console.log('🔵 Executing query for booked slots...');
    const appointmentSnapshot = await getDocs(appointmentsQuery);
    
    // Return the time slots from these appointments
    const bookedSlots = appointmentSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        time: data.time
      };
    });
    
    console.log(`✅ Found ${bookedSlots.length} booked time slots:`, bookedSlots);
    return bookedSlots;
  } catch (error: any) {
    console.error('❌ Error getting booked time slots:', error);
    
    // Try fallback approach if there's an issue with the composite index
    if (error.message && error.message.includes('index')) {
      console.log('🟡 Index error detected, using fallback approach...');
      try {
        // Fallback to a simpler query
        const simpleQuery = query(collection(db, 'appointments'));
        const snapshot = await getDocs(simpleQuery);
        
        // Filter manually
        const bookedSlots = snapshot.docs
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              time: data.time,
              status: data.status,
              date: data.date
            };
          })
          .filter(data => {
            // Only consider active appointments
            if (!['scheduled', 'checked-in', 'in-progress', 'completed'].includes(data.status)) {
              return false;
            }
            
            // Check if the date matches the requested date
            try {
              const appointmentDate = data.date.toDate();
              const appointmentDateString = format(appointmentDate, 'yyyy-MM-dd');
              const requestedDateString = format(date, 'yyyy-MM-dd');
              return appointmentDateString === requestedDateString;
            } catch (e) {
              console.error('❌ Error processing appointment date:', e);
              return false;
            }
          })
          .map(data => ({
            id: data.id,
            time: data.time
          }));
          
        console.log(`✅ Fallback found ${bookedSlots.length} booked slots:`, bookedSlots);
        return bookedSlots;
      } catch (fallbackError) {
        console.error('❌ Fallback for getting booked slots failed:', fallbackError);
        return []; // Return empty array in case of error
      }
    }
    
    // Return empty array in case of any error
    return [];
  }
};

// Define the available time slots for appointments
// These are the time slots that can be booked for appointments
export const ALL_TIME_SLOTS = [
  '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', 
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', 
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM'
];

// Get available time slots for a specific date, excluding the current appointment's time slot
export const getAvailableTimeSlots = async (date: Date, currentAppointmentId?: string) => {
  try {
    console.log('🔵 Getting available time slots for date:', format(date, 'yyyy-MM-dd'));
    
    // Get the booked time slots for the date
    const bookedSlotsData = await getBookedTimeSlots(date);
    
    // Create a map for quick lookup of current appointment slot
    const bookedSlotMap = new Map();
    
    // Build the map of booked slots (excluding current appointment if on same date)
    bookedSlotsData.forEach(slot => {
      if (currentAppointmentId && slot.id === currentAppointmentId) {
        console.log('🔵 Excluding current appointment from booked slots:', slot.time);
        return; // Skip the current appointment
      }
      bookedSlotMap.set(slot.time, true);
    });
    
    console.log('🔵 All booked slots (excluding current):', Array.from(bookedSlotMap.keys()));
    
    // Filter available slots based on booked slots
    const availableSlots = ALL_TIME_SLOTS.filter(slot => !bookedSlotMap.has(slot));
    
    // If we're editing an existing appointment and date matches, add its current slot back to available
    if (currentAppointmentId) {
      try {
        const appointmentRef = doc(db, 'appointments', currentAppointmentId);
        const appointmentDoc = await getDoc(appointmentRef);
        
        if (appointmentDoc.exists()) {
          const data = appointmentDoc.data();
          // Make sure the date matches our target date
          const appointmentDate = data.date.toDate();
          const appointmentDateStr = format(appointmentDate, 'yyyy-MM-dd');
          const targetDateStr = format(date, 'yyyy-MM-dd');
          
          if (appointmentDateStr === targetDateStr) {
            const currentTime = data.time;
            console.log('🔵 Current appointment time:', currentTime);
            
            // Only add if not already in the list
            if (!availableSlots.includes(currentTime)) {
              console.log('🔵 Adding current appointment time back to available slots');
              availableSlots.push(currentTime);
              // Sort the slots to maintain the right order
              availableSlots.sort((a, b) => {
                const timeA = a.split(':').map(part => part.replace(/\D/g, '')).map(Number);
                const timeB = b.split(':').map(part => part.replace(/\D/g, '')).map(Number);
                const isPMA = a.includes('PM');
                const isPMB = b.includes('PM');
                
                if (isPMA && !isPMB) return 1;
                if (!isPMA && isPMB) return -1;
                
                if (timeA[0] === 12) timeA[0] = 0;
                if (timeB[0] === 12) timeB[0] = 0;
                
                return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
              });
            }
          }
        }
      } catch (error) {
        console.error('❌ Error getting current appointment time:', error);
      }
    }
    
    console.log(`✅ Found ${availableSlots.length} available time slots:`, availableSlots);
    return availableSlots;
  } catch (error: any) {
    console.error('❌ Error getting available time slots:', error);
    return ALL_TIME_SLOTS; // Return all slots in case of error
  }
};