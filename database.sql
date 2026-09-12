-- =============================================================
-- ISU Student Routine Portal - Complete MySQL / MariaDB Database
-- Generated on: 2026-08-27T12:47:02.529Z
-- Compatibility: MySQL 5.7+, MySQL 8.0+, MariaDB 10.3+, phpMyAdmin, XAMPP
-- =============================================================
--
-- 💡 QUICK FIX FOR XAMPP / MariaDB Windows (GSSAPI or Access Denied Error):
-- If you experience "unknown plugin auth_gssapi_client" or "Access denied for user root",
-- run the following lines in phpMyAdmin > SQL tab:
--
-- ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '';
-- ALTER USER 'root'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '';
-- CREATE DATABASE IF NOT EXISTS `isu_routine_db`;
-- FLUSH PRIVILEGES;
-- =============================================================

CREATE DATABASE IF NOT EXISTS `isu_routine_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `isu_routine_db`;

-- 1. Departments Table
CREATE TABLE IF NOT EXISTS `departments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(10) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Semesters Table
CREATE TABLE IF NOT EXISTS `semesters` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Students Table (Numeric 10+ Digit IDs)
CREATE TABLE IF NOT EXISTS `students` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `department` VARCHAR(10) NOT NULL,
  `batch_no` VARCHAR(10) NOT NULL,
  `semester_id` INT NOT NULL DEFAULT 1,
  `total_credits` DECIMAL(4,1) DEFAULT 0.0,
  `last_login` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Courses Table
CREATE TABLE IF NOT EXISTS `courses` (
  `course_id` INT PRIMARY KEY,
  `course_code` VARCHAR(20) NOT NULL,
  `course_name` VARCHAR(150) NOT NULL,
  `department` VARCHAR(10) NOT NULL,
  `semester_id` INT NOT NULL,
  `credit` DECIMAL(3,1) NOT NULL DEFAULT 3.0,
  `is_default` BOOLEAN DEFAULT TRUE,
  `teacher` VARCHAR(100) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Student Enrolled Courses Table
CREATE TABLE IF NOT EXISTS `student_courses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` VARCHAR(50) NOT NULL,
  `course_id` INT NOT NULL,
  `semester_id` INT NOT NULL,
  `enrolled_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_student_course` (`student_id`, `course_id`),
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`course_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Routines Table
CREATE TABLE IF NOT EXISTS `routines` (
  `id` INT PRIMARY KEY,
  `course_id` INT NOT NULL,
  `department` VARCHAR(10) NOT NULL,
  `semester_id` INT NOT NULL,
  `batch_no` VARCHAR(10) DEFAULT 'ALL',
  `day` VARCHAR(15) NOT NULL,
  `date` DATE NULL,
  `type` VARCHAR(20) NOT NULL DEFAULT 'class',
  `assessment_tag` VARCHAR(50) NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `room` VARCHAR(50) NOT NULL,
  `teacher` VARCHAR(100) NOT NULL,
  `title` VARCHAR(150) NULL,
  `syllabus` TEXT NULL,
  `note` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`course_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Notifications Table (Broadcast & Targeted Audience)
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `target_type` VARCHAR(20) NOT NULL DEFAULT 'all', -- 'all', 'department', 'semester', 'course', 'student'
  `student_id` VARCHAR(50) NULL,
  `department` VARCHAR(10) NOT NULL DEFAULT 'ALL',
  `semester_id` INT NULL,
  `course_id` INT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `type` VARCHAR(20) NOT NULL DEFAULT 'general', -- 'class', 'ct', 'mid', 'final', 'urgent', 'general'
  `link` VARCHAR(255) NULL,
  `created_by` VARCHAR(100) NULL,
  `is_read` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`course_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Student Notification Reads Table (Personalized read tracking across broadcast notices)
CREATE TABLE IF NOT EXISTS `student_notification_reads` (
  `student_id` VARCHAR(50) NOT NULL,
  `notification_id` INT NOT NULL,
  `read_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`, `notification_id`),
  FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- AUTO-IMPORT SEED DATA
-- =============================================================

-- Seed Departments
INSERT IGNORE INTO `departments` (`code`, `name`) VALUES
  ('AMM', 'Apparel Manufacturing & Merchandising'),
  ('CSE', 'Computer Science & Engineering'),
  ('EEE', 'Electrical & Electronic Engineering'),
  ('BBA', 'Bachelor of Business Administration'),
  ('English', 'Department of English'),
  ('Textile', 'Textile Engineering');

-- Seed Semesters
INSERT IGNORE INTO `semesters` (`id`, `name`, `is_active`) VALUES
  (1, '1st Semester', 1),
  (2, '2nd Semester', 0),
  (3, '3rd Semester', 0),
  (4, '4th Semester', 0),
  (5, '5th Semester', 0),
  (6, '6th Semester', 0),
  (7, '7th Semester', 0),
  (8, '8th Semester', 0);

-- Seed Master Courses
INSERT IGNORE INTO `courses` (`course_id`, `course_code`, `course_name`, `department`, `semester_id`, `credit`, `is_default`, `teacher`) VALUES
  (101, 'AMM 101', 'Introduction to Apparel & Textile Technology', 'AMM', 1, 3, 1, 'Prof. Dr. M. Rahman'),
  (102, 'AMM 102', 'Textile Fibers, Polymers & Identification', 'AMM', 1, 3, 1, 'Engr. Nazmul Hossain'),
  (103, 'AMM 103', 'Fashion Illustration & Design Basics', 'AMM', 1, 2, 1, 'Ms. Sarah Tarannum'),
  (104, 'MAT 101', 'Applied Mathematics for Merchandising', 'AMM', 1, 3, 1, 'Dr. Anisur Rahman'),
  (105, 'ENG 101', 'Professional English & RMG Terminology', 'AMM', 1, 3, 1, 'Kazi Mahbubul Alam'),
  (106, 'AMM 201', 'Yarn Manufacturing Technology & Structure', 'AMM', 2, 3, 1, 'Engr. Nazmul Hossain'),
  (107, 'AMM 202', 'Apparel Merchandising Fundamentals & Costing', 'AMM', 2, 3, 1, 'Prof. Dr. M. Rahman'),
  (108, 'AMM 203', 'Pattern Making & Grading Techniques - I', 'AMM', 2, 3, 1, 'Ms. Sarah Tarannum'),
  (109, 'PHY 102', 'Applied Physics for Textile Machinery', 'AMM', 2, 3, 1, 'Dr. Farhana Islam'),
  (110, 'CHM 101', 'Textile Chemistry & Wet Processing', 'AMM', 2, 3, 1, 'Dr. Rafiqul Hassan'),
  (111, 'AMM 301', 'Fabric Structure & Woven Design Analysis', 'AMM', 3, 3, 1, 'Engr. Nazmul Hossain'),
  (112, 'AMM 302', 'Garment Manufacturing Process - I', 'AMM', 3, 3, 1, 'Prof. Dr. M. Rahman'),
  (113, 'AMM 303', 'CAD for Pattern & Marker Planning', 'AMM', 3, 3, 1, 'Ms. Sarah Tarannum'),
  (114, 'ACC 201', 'Cost & Management Accounting in RMG', 'AMM', 3, 3, 1, 'Dr. Anisur Rahman'),
  (115, 'AMM 401', 'Dyeing, Printing & Finishing Technology', 'AMM', 4, 3, 1, 'Dr. Rafiqul Hassan'),
  (116, 'AMM 402', 'Apparel Quality Assurance & AQL Inspection', 'AMM', 4, 3, 1, 'Engr. Nazmul Hossain'),
  (117, 'AMM 403', 'Apparel Sourcing & Global Supply Chain', 'AMM', 4, 3, 1, 'Prof. Dr. M. Rahman'),
  (118, 'STAT 202', 'Statistical Quality Control in Apparel', 'AMM', 4, 3, 1, 'Dr. Anisur Rahman'),
  (119, 'AMM 501', 'Garment Manufacturing Process - II', 'AMM', 5, 3, 1, 'Engr. Nazmul Hossain'),
  (120, 'AMM 502', 'Industrial Engineering (IE) & Work Study', 'AMM', 5, 3, 1, 'Prof. Dr. M. Rahman'),
  (121, 'AMM 503', 'Knitwear & Sweater Manufacturing', 'AMM', 5, 3, 1, 'Ms. Sarah Tarannum'),
  (122, 'MKT 301', 'Fashion Branding & Retail Merchandising', 'AMM', 5, 3, 1, 'Kazi Mahbubul Alam'),
  (123, 'AMM 601', 'Sustainable Apparel & Social Compliance', 'AMM', 6, 3, 1, 'Prof. Dr. M. Rahman'),
  (124, 'AMM 602', 'Production Planning & Control (PPC)', 'AMM', 6, 3, 1, 'Engr. Nazmul Hossain'),
  (125, 'AMM 603', 'Denim & Special Garment Processing', 'AMM', 6, 3, 1, 'Ms. Sarah Tarannum'),
  (126, 'AMM 701', 'International Trade & Export-Import Logistics', 'AMM', 7, 3, 1, 'Prof. Dr. M. Rahman'),
  (127, 'AMM 702', 'Technical Textiles & Smart Apparel', 'AMM', 7, 3, 1, 'Engr. Nazmul Hossain'),
  (128, 'AMM 703', 'ERP Software in Garment Industry', 'AMM', 7, 3, 1, 'Dr. Farhana Islam'),
  (129, 'AMM 801', 'Apparel Capstone Project & Defense', 'AMM', 8, 4, 1, 'Prof. Dr. M. Rahman'),
  (130, 'AMM 802', 'Industrial Internship in RMG Sector', 'AMM', 8, 6, 1, 'Engr. Nazmul Hossain'),
  (131, 'AMM 803', 'Fashion Entrepreneurship & Innovation', 'AMM', 8, 3, 1, 'Ms. Sarah Tarannum'),
  (201, 'CSE 111', 'Structured Programming Language (C)', 'CSE', 1, 3, 1, 'Dr. Faisal Kabir'),
  (202, 'CSE 112', 'Structured Programming Lab', 'CSE', 1, 1.5, 1, 'Engr. Tanvir Ahmed'),
  (203, 'MATH 141', 'Differential and Integral Calculus', 'CSE', 1, 3, 1, 'Dr. Anisur Rahman'),
  (204, 'ENG 101', 'Basic English Communication', 'CSE', 1, 3, 1, 'Kazi Mahbubul Alam'),
  (205, 'PHY 101', 'Physics (Mechanics & Waves)', 'CSE', 1, 3, 1, 'Dr. Farhana Islam'),
  (206, 'CSE 121', 'Object Oriented Programming (Java/C++)', 'CSE', 2, 3, 1, 'Dr. Faisal Kabir'),
  (207, 'CSE 122', 'OOP Laboratory', 'CSE', 2, 1.5, 1, 'Engr. Tanvir Ahmed'),
  (208, 'CSE 123', 'Discrete Mathematics', 'CSE', 2, 3, 1, 'Dr. Anisur Rahman'),
  (209, 'MATH 143', 'Linear Algebra & Complex Analysis', 'CSE', 2, 3, 1, 'Dr. Farhana Islam'),
  (210, 'CSE 211', 'Data Structures & Algorithms', 'CSE', 3, 3, 1, 'Dr. Faisal Kabir'),
  (211, 'CSE 212', 'Data Structures Lab', 'CSE', 3, 1.5, 1, 'Engr. Tanvir Ahmed'),
  (212, 'CSE 213', 'Digital Logic Design', 'CSE', 3, 3, 1, 'Dr. Farhana Islam'),
  (213, 'CSE 214', 'Database Management Systems (SQL)', 'CSE', 3, 3, 1, 'Dr. Faisal Kabir'),
  (301, 'EEE 101', 'Electrical Circuit Analysis I', 'EEE', 1, 3, 1, 'Dr. Kamrul Hasan'),
  (302, 'EEE 102', 'Circuit Analysis Lab', 'EEE', 1, 1.5, 1, 'Engr. Asif Iqbal'),
  (303, 'MATH 101', 'Engineering Mathematics', 'EEE', 1, 3, 1, 'Dr. Anisur Rahman'),
  (401, 'BUS 101', 'Principles of Management', 'BBA', 1, 3, 1, 'Prof. S. R. Chowdhury'),
  (402, 'ACT 101', 'Financial Accounting I', 'BBA', 1, 3, 1, 'Ms. Tahmina Akter'),
  (403, 'MKT 101', 'Principles of Marketing', 'BBA', 1, 3, 1, 'Prof. S. R. Chowdhury'),
  (501, 'ENG 111', 'Introduction to English Literature', 'English', 1, 3, 1, 'Dr. R. K. Mukherjee'),
  (502, 'ENG 112', 'History of English Language', 'English', 1, 3, 1, 'Dr. R. K. Mukherjee');

-- Seed Initial Students (passwords hashed with bcrypt)
INSERT IGNORE INTO `students` (`id`, `student_id`, `name`, `password_hash`, `department`, `batch_no`, `semester_id`, `total_credits`, `last_login`) VALUES
  (1, '2023100101', 'Tamanna Jannat', '$2b$10$ctU4ieHl0mPZ/KY2ASvuWOj7K1J/xpfqihdwwJ2dwy5GhNbhxpQAC', 'AMM', '1', 1, 14, NOW()),
  (2, '2023100201', 'MD Shabbir Ahmed', '$2b$10$ctU4ieHl0mPZ/KY2ASvuWOj7K1J/xpfqihdwwJ2dwy5GhNbhxpQAC', 'CSE', '2', 1, 13.5, NOW());

-- Seed Student Enrolled Courses
INSERT IGNORE INTO `student_courses` (`student_id`, `course_id`, `semester_id`) VALUES
  ('2023100101', 101, 1),
  ('2023100101', 102, 1),
  ('2023100101', 103, 1),
  ('2023100101', 104, 1),
  ('2023100101', 105, 1),
  ('2023100201', 201, 1),
  ('2023100201', 202, 1),
  ('2023100201', 203, 1),
  ('2023100201', 204, 1),
  ('2023100201', 205, 1);

-- Seed Master Routines
INSERT IGNORE INTO `routines` (`id`, `course_id`, `department`, `semester_id`, `batch_no`, `day`, `date`, `type`, `assessment_tag`, `start_time`, `end_time`, `room`, `teacher`, `title`, `syllabus`, `note`) VALUES
  (1001, 101, 'AMM', 1, 'ALL', 'Saturday', NULL, 'class', 'Regular Class', '09:00:00', '10:30:00', 'Room 501 (Textile Wing)', 'Prof. Dr. M. Rahman', NULL, NULL, 'Bring textile lab safety guide'),
  (1002, 102, 'AMM', 1, 'ALL', 'Saturday', NULL, 'class', 'Regular Class', '11:00:00', '12:30:00', 'Lab Room 302', 'Engr. Nazmul Hossain', NULL, NULL, 'Fiber identification microscope lab'),
  (1003, 101, 'AMM', 1, 'ALL', 'Sunday', '2026-08-30', 'ct1', 'CT 1', '09:30:00', '10:15:00', 'Room 501', 'Prof. Dr. M. Rahman', 'Class Test 1: Natural & Synthetic Fibers', 'Chapters 1 to 3: Cotton, Wool, Polyester & Polymer chain structures', 'Total 20 Marks. Scientific calculator allowed.'),
  (1004, 103, 'AMM', 1, 'ALL', 'Monday', NULL, 'class', 'Lab Session', '10:00:00', '12:00:00', 'Design Studio 401', 'Ms. Sarah Tarannum', NULL, NULL, 'Carry 8-head croquis sketching sheets'),
  (1005, 102, 'AMM', 1, 'ALL', 'Tuesday', '2026-09-08', 'ct2', 'CT 2', '11:00:00', '11:45:00', 'Lab Room 302', 'Engr. Nazmul Hossain', 'Class Test 2: Chemical Solubility & Burning Test', 'Solubility chart, burning test behavior, tensile strength calculation', 'Total 20 Marks.'),
  (1006, 104, 'AMM', 1, 'ALL', 'Wednesday', NULL, 'class', 'Regular Class', '09:00:00', '10:30:00', 'Room 502', 'Dr. Anisur Rahman', NULL, NULL, 'Consumption formulas & fabric calculation'),
  (1007, 101, 'AMM', 1, 'ALL', 'Thursday', '2026-09-22', 'mid', 'Midterm Exam', '10:00:00', '12:00:00', 'Central Exam Hall-A', 'Prof. Dr. M. Rahman', 'Midterm Examination: Apparel & Textile Foundation', 'Full syllabus of Weeks 1-7 including Spinning, Weaving & Garment Construction', 'Admit card and student ID mandatory. Total 40 marks.'),
  (1008, 102, 'AMM', 1, 'ALL', 'Saturday', '2026-10-18', 'final', 'Final Exam', '10:00:00', '01:00:00', 'Central Exam Hall-B', 'Engr. Nazmul Hossain', 'Semester Final Examination: AMM 102', 'Comprehensive final examination over full semester curriculum', 'Calculators and drawing kits permitted.'),
  (1009, 106, 'AMM', 2, 'ALL', 'Saturday', NULL, 'class', 'Regular Class', '09:00:00', '10:30:00', 'Room 402 (Spinning Wing)', 'Engr. Nazmul Hossain', NULL, NULL, 'Ring spinning vs Rotor spinning comparison'),
  (1010, 107, 'AMM', 2, 'ALL', 'Saturday', NULL, 'class', 'Regular Class', '11:00:00', '12:30:00', 'Room 503', 'Prof. Dr. M. Rahman', NULL, NULL, 'CM Costing and Fabric consumption sheet'),
  (1011, 106, 'AMM', 2, 'ALL', 'Sunday', NULL, 'class', 'Regular Class', '10:00:00', '11:30:00', 'Spinning Lab 1', 'Engr. Nazmul Hossain', NULL, NULL, 'Count calculation (Ne, Tex, Denier) & Twist multiplier'),
  (1012, 108, 'AMM', 2, 'ALL', 'Monday', NULL, 'class', 'Lab Session', '09:30:00', '12:00:00', 'Pattern Studio 201', 'Ms. Sarah Tarannum', NULL, NULL, 'Basic bodice block and sleeve drafting'),
  (1013, 106, 'AMM', 2, 'ALL', 'Tuesday', '2026-09-08', 'ct1', 'CT 1', '09:30:00', '10:15:00', 'Room 402', 'Engr. Nazmul Hossain', 'Class Test 1: Blowroom & Carding Actions', 'Opening, cleaning efficiency, carding setting and sliver hank calculation', 'Total 20 Marks.'),
  (1014, 109, 'AMM', 2, 'ALL', 'Tuesday', NULL, 'class', 'Regular Class', '11:00:00', '12:30:00', 'Room 304', 'Dr. Farhana Islam', NULL, NULL, 'Dynamics of high-speed spindle rotation'),
  (1015, 110, 'AMM', 2, 'ALL', 'Wednesday', NULL, 'class', 'Regular Class', '09:00:00', '10:30:00', 'Chemistry Lab 102', 'Dr. Rafiqul Hassan', NULL, NULL, 'Desizing, scouring and bleaching kinetics'),
  (1016, 107, 'AMM', 2, 'ALL', 'Thursday', '2026-09-24', 'mid', 'Midterm Exam', '10:00:00', '12:00:00', 'Central Exam Hall-A', 'Prof. Dr. M. Rahman', 'Midterm Examination: Apparel Costing & Sourcing', 'Incoterms (FOB, CIF, CFR), BOM calculation, consumption formulas and time-action calendar', 'Non-programmable calculator allowed. Total 40 marks.'),
  (2001, 201, 'CSE', 1, 'ALL', 'Saturday', NULL, 'class', 'Regular Class', '10:00:00', '11:30:00', 'Room 604', 'Dr. Faisal Kabir', NULL, NULL, 'Pointers & Dynamic Memory Allocation'),
  (2002, 201, 'CSE', 1, 'ALL', 'Monday', '2026-09-01', 'ct1', 'CT 1', '10:00:00', '10:45:00', 'Room 604', 'Dr. Faisal Kabir', 'Class Test 1: Loops, Arrays & Pointers', 'Basic C syntax, nested loops, multi-dimensional arrays', 'Closed book. 20 marks.');

-- Seed Notifications
INSERT IGNORE INTO `notifications` (`id`, `department`, `semester_id`, `course_id`, `title`, `message`, `type`, `link`, `is_read`, `created_at`) VALUES
  (1, 'AMM', 1, 101, '📢 AMM Class Test 1 (CT-1) Schedule Announced', 'Class Test 1 for AMM 101 is scheduled for Sunday, August 30 at 9:30 AM in Room 501. Topics: Natural & Synthetic Fibers.', 'ct', '', 0, '2026-08-25 08:30:00'),
  (2, 'AMM', 1, 101, '📅 AMM Midterm Examination Notice', 'The Midterm Examination for Apparel Manufacturing & Merchandising (AMM) 1st Semester will commence on September 22, 2026.', 'mid', 'https://isu.edu.bd/academic-calendar', 0, '2026-08-24 14:15:00'),
  (3, 'ALL', 1, NULL, '🏛️ University PWA Routine App Offline Support', 'You can now install the ISU Student Routine app directly to your home screen from the Settings menu for instant offline routine viewing.', 'general', '', 0, '2026-08-23 10:00:00');
